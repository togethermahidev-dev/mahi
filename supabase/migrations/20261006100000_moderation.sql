-- Moderation (owner, 2026-10-06): reports on people, posts, comments and messages tracked on the
-- server; a staff list and staff-only actions, each written to an audit log; hidden posts and
-- removed comments left out of the feed and profiles; and an AI check of new posts and comments
-- that runs only once an OpenAI key is set. Modelled on pingmee-v2 (staff_users, is_staff,
-- admin_actions, moderation_events, the moderate-* functions), adapted to Mahi's tables.
-- The contract for the app and the staff portal: docs/moderation.md.
--
-- What stays the same: the app's existing report (an insert into user_reports from the profile
-- screen, "Already reported" on a repeat) keeps working unchanged; every feed and profile rule
-- other than "hidden posts are left out" is untouched.
--
-- Test: supabase/tests/moderation_test.sql
-- Undo: supabase/rollbacks/20261006100000_moderation.rollback.sql

-- 1. Staff. Rows are added by the owner in a migration (never from the app), e.g.
--      insert into public.staff_users (user_id, role) values ('<auth user id>', 'admin');
--    admin: everything. moderator: everything except banning and unbanning.
create table public.staff_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);
alter table public.staff_users enable row level security;
-- You can read your own staff row; nobody can write one from the app.
create policy staff_users_read_own on public.staff_users
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.staff_users from anon, authenticated;

-- One person's staff role (null when not staff). Internal: it reads past RLS.
create function public.staff_role(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.staff_users where user_id = p_user;
$$;

-- Is the caller staff? Used by the RLS rules below and by the staff portal's gate. Says nothing
-- about anyone else (pingmee's recursive-RLS lesson: a policy never selects staff_users itself).
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (select 1 from public.staff_users where user_id = auth.uid());
$$;

-- The caller's role for the staff portal: 'admin', 'moderator' or null.
create function public.my_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_role(auth.uid());
$$;

-- Every staff action starts here: the caller's id, or an error.
create function public.require_staff(p_admin_only boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.staff_role(auth.uid());
begin
  if v_role is null then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_admin_only and v_role <> 'admin' then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- 2. Hidden posts and removed comments. Kept (evidence, and so a mistake can be undone), but
--    nobody except staff sees them.
alter table public.posts
  add column hidden_at timestamptz,
  add column hidden_by uuid references auth.users(id) on delete set null,
  add column hidden_reason text;
alter table public.post_comments
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users(id) on delete set null,
  add column removed_reason text;

-- A post's owner may still edit their post (posts_update), but not its moderation columns.
create function public.protect_moderation_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.hidden_at is distinct from old.hidden_at
          or new.hidden_by is distinct from old.hidden_by
          or new.hidden_reason is distinct from old.hidden_reason) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger protect_moderation_columns
  before update on public.posts
  for each row execute function public.protect_moderation_columns();

drop policy posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated using (hidden_at is null or public.is_staff());

drop policy comments_select on public.post_comments;
create policy comments_select on public.post_comments
  for select to authenticated using (removed_at is null or public.is_staff());

-- A banned or suspended person can't comment.
drop policy comments_insert on public.post_comments;
create policy comments_insert on public.post_comments
  for insert to authenticated with check (
    auth.uid() = user_id
    and not exists (select 1 from public.profiles where id = auth.uid() and is_banned)
  );

-- 3. Reports. The app's user_reports table grows to cover posts, comments and messages, with a
--    status and who dealt with it. It held no rows on production (checked 2026-10-06).
alter table public.user_reports
  drop constraint user_reports_unique_user,
  drop constraint user_reports_has_target,
  drop constraint user_reports_reason_check,
  drop constraint user_reports_reported_post_id_fkey,
  alter column reporter_id drop not null,
  add column reported_comment_id uuid references public.post_comments(id) on delete set null,
  add column reported_message_id uuid references public.messages(id) on delete set null,
  add column target_type text,
  add column target_id uuid,
  add column target_owner_id uuid references public.profiles(id) on delete set null,
  add column snapshot jsonb,
  add column source text not null default 'user',
  add column status text not null default 'open',
  add column ai_labels text[],
  add column ai_scores jsonb,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column reviewed_at timestamptz,
  add column resolution_note text,
  add column updated_at timestamptz not null default now();

-- A reported post that is later deleted keeps its report (and the snapshot of what it said).
alter table public.user_reports
  add constraint user_reports_reported_post_id_fkey
    foreign key (reported_post_id) references public.posts(id) on delete set null;

-- Rows from before this migration (none on production) get their target.
update public.user_reports
set target_type = case when reported_post_id is not null then 'post' else 'user' end,
    target_id = coalesce(reported_post_id, reported_user_id);

alter table public.user_reports
  alter column target_type set not null,
  alter column target_id set not null,
  add constraint user_reports_target_type_check
    check (target_type in ('user', 'post', 'comment', 'message')),
  add constraint user_reports_reason_check check (reason in (
    'spam', 'harassment', 'hate_speech', 'sexual_content', 'violence', 'self_harm', 'scam',
    'impersonation', 'underage', 'inappropriate_content', 'other')),
  add constraint user_reports_source_check check (source in ('user', 'ai')),
  add constraint user_reports_status_check
    check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  add constraint user_reports_reporter_check check (source = 'ai' or reporter_id is not null),
  add constraint user_reports_description_length
    check (description is null or char_length(description) <= 500);

-- One report per person per thing (a repeat is "Already reported", error 23505 as before), and
-- one AI flag per thing.
create unique index user_reports_one_per_reporter
  on public.user_reports (reporter_id, target_type, target_id) where reporter_id is not null;
create unique index user_reports_one_ai_flag
  on public.user_reports (target_type, target_id) where source = 'ai';
create index user_reports_queue on public.user_reports (status, created_at desc);
create index user_reports_target on public.user_reports (target_type, target_id);
create index user_reports_owner on public.user_reports (target_owner_id);

-- Fill in what was reported, whose it is, and a copy of what it said, however the row arrives
-- (the RPCs below, or an older app's direct insert).
create function public.user_reports_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts;
  v_comment public.post_comments;
  v_message public.messages;
begin
  if new.reported_comment_id is not null then
    select * into v_comment from public.post_comments where id = new.reported_comment_id;
    new.target_type := 'comment';
    new.target_id := new.reported_comment_id;
    new.target_owner_id := v_comment.user_id;
    new.reported_post_id := coalesce(new.reported_post_id, v_comment.post_id);
    new.snapshot := jsonb_build_object('content', v_comment.content,
                                       'created_at', v_comment.created_at);
  elsif new.reported_message_id is not null then
    select * into v_message from public.messages where id = new.reported_message_id;
    new.target_type := 'message';
    new.target_id := new.reported_message_id;
    new.target_owner_id := v_message.sender_id;
    new.snapshot := jsonb_build_object('content', v_message.content,
                                       'conversation_id', v_message.conversation_id,
                                       'created_at', v_message.created_at);
  elsif new.reported_post_id is not null then
    select * into v_post from public.posts where id = new.reported_post_id;
    new.target_type := 'post';
    new.target_id := new.reported_post_id;
    new.target_owner_id := v_post.user_id;
    new.snapshot := jsonb_build_object('caption', v_post.caption,
                                       'image_path', v_post.image_path,
                                       'pov_image_path', v_post.pov_image_path,
                                       'rear_media_type', v_post.rear_media_type,
                                       'front_media_type', v_post.front_media_type,
                                       'created_at', v_post.created_at);
  elsif new.reported_user_id is not null then
    new.target_type := 'user';
    new.target_id := new.reported_user_id;
    new.target_owner_id := new.reported_user_id;
    new.snapshot := (select jsonb_build_object('username', username, 'display_name', display_name,
                                               'avatar_url', avatar_url)
                     from public.profiles where id = new.reported_user_id);
  else
    raise exception 'a report needs something to report' using errcode = '23514';
  end if;
  if new.target_owner_id is null then
    raise exception 'that does not exist' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger user_reports_fill
  before insert on public.user_reports
  for each row execute function public.user_reports_fill();

-- The app may write only the columns it writes today; status, source and the rest are the
-- server's. Its own reports stay readable to it ("Users can read own reports").
revoke insert, update, delete, truncate on public.user_reports from anon, authenticated;
grant insert (reporter_id, reported_user_id, reported_post_id, reason, description)
  on public.user_reports to authenticated;
create policy user_reports_staff_read on public.user_reports
  for select to authenticated using (public.is_staff());

-- 4. Warnings, suspensions and bans, with their reasons. profiles.is_banned stays the one switch
--    every rule already reads: a suspension sets it until ends_at (lift_ended_suspensions puts it
--    back), a ban until a staff member unbans.
create table public.user_sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('warning', 'suspension', 'ban')),
  reason text not null check (char_length(reason) between 1 and 500),   -- shown to the person
  report_id uuid references public.user_reports(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ends_at timestamptz,                                                  -- suspensions only
  lifted_at timestamptz,
  lifted_by uuid references auth.users(id) on delete set null,
  seen_at timestamptz,                                                  -- warnings: shown in the app
  constraint user_sanctions_ends check ((kind = 'suspension') = (ends_at is not null))
);
create index user_sanctions_user on public.user_sanctions (user_id, created_at desc);
create index user_sanctions_active on public.user_sanctions (ends_at)
  where kind = 'suspension' and lifted_at is null;
alter table public.user_sanctions enable row level security;
revoke insert, update, delete, truncate on public.user_sanctions from anon, authenticated;
create policy user_sanctions_read on public.user_sanctions
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

-- 5. The audit log: one row per staff action (and per automatic AI action, staff_id null).
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null check (target_type in ('user', 'post', 'comment', 'message', 'report')),
  target_id uuid not null,
  report_id uuid references public.user_reports(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index moderation_actions_target on public.moderation_actions (target_type, target_id);
create index moderation_actions_created on public.moderation_actions (created_at desc);
alter table public.moderation_actions enable row level security;
revoke insert, update, delete, truncate on public.moderation_actions from anon, authenticated;
create policy moderation_actions_staff_read on public.moderation_actions
  for select to authenticated using (public.is_staff());

create function public.log_moderation_action(
  p_action text, p_target_type text, p_target_id uuid, p_report_id uuid, p_reason text,
  p_metadata jsonb default '{}'
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.moderation_actions (staff_id, action, target_type, target_id, report_id, reason, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_report_id, p_reason, coalesce(p_metadata, '{}'));
$$;

-- Close every open report on a thing as actioned (or dismissed), stamped with who and why.
create function public.close_reports(
  p_target_type text, p_target_id uuid, p_status text, p_note text, p_report_id uuid default null
)
returns int
language sql
security definer
set search_path = public
as $$
  with done as (
    update public.user_reports
    set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(),
        resolution_note = coalesce(p_note, resolution_note), updated_at = now()
    where status in ('open', 'reviewing')
      and ((target_type = p_target_type and target_id = p_target_id) or id = p_report_id)
    returning 1
  )
  select count(*)::int from done;
$$;

-- 6. Reporting, for the app. Each returns {"report_id": uuid, "already_reported": bool}; a repeat
--    returns the first report instead of an error. Reasons: see user_reports_reason_check.
create function public.file_report(
  p_target_type text, p_target_id uuid, p_reason text, p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id uuid;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in (
    'spam', 'harassment', 'hate_speech', 'sexual_content', 'violence', 'self_harm', 'scam',
    'impersonation', 'underage', 'inappropriate_content', 'other') then
    raise exception 'unknown reason' using errcode = '22023';
  end if;
  if char_length(v_details) > 500 then
    raise exception 'details are at most 500 characters' using errcode = '22023';
  end if;

  v_owner := case p_target_type
    when 'user' then (select id from public.profiles where id = p_target_id)
    when 'post' then (select user_id from public.posts where id = p_target_id)
    when 'comment' then (select user_id from public.post_comments where id = p_target_id)
    when 'message' then (
      select m.sender_id from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = p_target_id and v_uid in (c.participant_one, c.participant_two))
  end;
  if v_owner is null then
    raise exception 'that does not exist' using errcode = '22023';
  end if;
  if v_owner = v_uid then
    raise exception 'you cannot report yourself' using errcode = '22023';
  end if;

  select id into v_id from public.user_reports
  where reporter_id = v_uid and target_type = p_target_type and target_id = p_target_id;
  if found then
    return jsonb_build_object('report_id', v_id, 'already_reported', true);
  end if;

  -- Enough for anyone acting in good faith; stops one account flooding the list.
  if (select count(*) from public.user_reports
      where reporter_id = v_uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many reports today' using errcode = 'P0001';
  end if;

  insert into public.user_reports (reporter_id, reported_user_id, reported_post_id,
                                   reported_comment_id, reported_message_id, reason, description)
  values (v_uid,
          case when p_target_type = 'user' then p_target_id end,
          case when p_target_type = 'post' then p_target_id end,
          case when p_target_type = 'comment' then p_target_id end,
          case when p_target_type = 'message' then p_target_id end,
          p_reason, v_details)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then           -- a double tap racing itself
    select id into v_id from public.user_reports
    where reporter_id = v_uid and target_type = p_target_type and target_id = p_target_id;
    return jsonb_build_object('report_id', v_id, 'already_reported', true);
  end if;
  return jsonb_build_object('report_id', v_id, 'already_reported', false);
end;
$$;

create function public.report_user(p_user_id uuid, p_reason text, p_details text default null)
returns jsonb language sql security definer set search_path = public as $$
  select public.file_report('user', p_user_id, p_reason, p_details);
$$;
create function public.report_post(p_post_id uuid, p_reason text, p_details text default null)
returns jsonb language sql security definer set search_path = public as $$
  select public.file_report('post', p_post_id, p_reason, p_details);
$$;
create function public.report_comment(p_comment_id uuid, p_reason text, p_details text default null)
returns jsonb language sql security definer set search_path = public as $$
  select public.file_report('comment', p_comment_id, p_reason, p_details);
$$;
create function public.report_message(p_message_id uuid, p_reason text, p_details text default null)
returns jsonb language sql security definer set search_path = public as $$
  select public.file_report('message', p_message_id, p_reason, p_details);
$$;

-- 7. Your own standing, for the app: banned / suspended (and until when, and why) and warnings
--    you haven't seen yet.
create function public.get_my_standing()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'status', case
      when not p.is_banned then 'ok'
      when s.kind = 'suspension' then 'suspended'
      else 'banned' end,
    'until', case when p.is_banned and s.kind = 'suspension' then s.ends_at end,
    'reason', case when p.is_banned then s.reason end,
    'warnings', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'reason', w.reason, 'created_at', w.created_at)
                       order by w.created_at)
      from public.user_sanctions w
      where w.user_id = p.id and w.kind = 'warning' and w.seen_at is null and w.lifted_at is null
    ), '[]'::jsonb)
  )
  from public.profiles p
  left join lateral (
    select * from public.user_sanctions x
    where x.user_id = p.id and x.kind in ('suspension', 'ban') and x.lifted_at is null
    order by (x.kind = 'ban') desc, x.created_at desc
    limit 1
  ) s on true
  where p.id = auth.uid();
$$;

create function public.mark_warnings_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_sanctions set seen_at = now()
  where user_id = auth.uid() and kind = 'warning' and seen_at is null;
$$;

-- 8. Staff: the list. One row per report, newest first, with what was reported and whose it is.
create function public.report_item(r public.user_reports)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'source', r.source,
    'reason', r.reason,
    'details', r.description,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'reviewed_by', r.reviewed_by,
    'reviewed_at', r.reviewed_at,
    'resolution_note', r.resolution_note,
    'ai_labels', to_jsonb(r.ai_labels),
    'ai_scores', r.ai_scores,
    'target_type', r.target_type,
    'target_id', r.target_id,
    'snapshot', r.snapshot,
    'reporter', (select jsonb_build_object('id', p.id, 'username', p.username)
                 from public.profiles p where p.id = r.reporter_id),
    'owner', (select jsonb_build_object('id', p.id, 'username', p.username,
                                        'display_name', p.display_name, 'avatar_url', p.avatar_url,
                                        'is_banned', p.is_banned)
              from public.profiles p where p.id = r.target_owner_id),
    'target', case r.target_type
      when 'post' then (select jsonb_build_object(
          'id', x.id, 'caption', x.caption, 'image_path', x.image_path,
          'pov_image_path', x.pov_image_path, 'rear_media_type', x.rear_media_type,
          'front_media_type', x.front_media_type, 'created_at', x.created_at,
          'hidden_at', x.hidden_at, 'hidden_reason', x.hidden_reason)
        from public.posts x where x.id = r.target_id)
      when 'comment' then (select jsonb_build_object(
          'id', x.id, 'post_id', x.post_id, 'content', x.content, 'created_at', x.created_at,
          'removed_at', x.removed_at, 'removed_reason', x.removed_reason)
        from public.post_comments x where x.id = r.target_id)
      when 'message' then (select jsonb_build_object(
          'id', x.id, 'conversation_id', x.conversation_id, 'content', x.content,
          'created_at', x.created_at)
        from public.messages x where x.id = r.target_id)
      when 'user' then (select jsonb_build_object(
          'id', x.id, 'username', x.username, 'display_name', x.display_name,
          'avatar_url', x.avatar_url, 'is_banned', x.is_banned)
        from public.profiles x where x.id = r.target_id)
    end,
    'open_reports_on_target', (
      select count(*) from public.user_reports o
      where o.target_type = r.target_type and o.target_id = r.target_id
        and o.status in ('open', 'reviewing'))
  );
$$;

create function public.staff_get_queue(
  p_status text default 'open',
  p_target_type text default null,
  p_limit int default 50,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  return coalesce((
    select jsonb_agg(public.report_item(s.r) order by (s.r).created_at desc, (s.r).id desc)
    from (
      select r
      from public.user_reports r
      where (p_status is null or r.status = p_status)
        and (p_target_type is null or r.target_type = p_target_type)
        and (p_before is null or r.created_at < p_before)
      order by r.created_at desc, r.id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) s
  ), '[]'::jsonb);
end;
$$;

-- One report with everything around it: other reports on the same thing, the owner's past
-- reports, warnings, suspensions and bans, staff actions, and the AI's checks.
create function public.staff_get_report(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.user_reports;
begin
  perform public.require_staff();
  select * into r from public.user_reports where id = p_report_id;
  if not found then
    raise exception 'no such report' using errcode = '22023';
  end if;
  return public.report_item(r) || jsonb_build_object(
    'other_reports', coalesce((
      select jsonb_agg(public.report_item(o) order by o.created_at desc)
      from public.user_reports o
      where o.id <> r.id
        and ((o.target_type = r.target_type and o.target_id = r.target_id)
             or o.target_owner_id = r.target_owner_id)
    ), '[]'::jsonb),
    'sanctions', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from public.user_sanctions s where s.user_id = r.target_owner_id
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from public.moderation_actions a
      where a.report_id = r.id
         or (a.target_type = r.target_type and a.target_id = r.target_id)
         or (a.target_type = 'user' and a.target_id = r.target_owner_id)
    ), '[]'::jsonb),
    'scans', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from public.moderation_scans s
      where s.target_type = r.target_type and s.target_id = r.target_id
    ), '[]'::jsonb)
  );
end;
$$;

-- 9. Staff: what to do with a report.
create function public.staff_review_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.user_reports;
begin
  perform public.require_staff();
  update public.user_reports
  set status = 'reviewing', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_report_id and status in ('open', 'reviewing')
  returning * into r;
  if not found then
    raise exception 'that report is closed or does not exist' using errcode = '22023';
  end if;
  perform public.log_moderation_action('review_report', 'report', r.id, r.id, null);
  return public.report_item(r);
end;
$$;

-- Nothing wrong: this report (and only this one) is closed as dismissed.
create function public.staff_dismiss_report(p_report_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.user_reports;
begin
  perform public.require_staff();
  update public.user_reports
  set status = 'dismissed', reviewed_by = auth.uid(), reviewed_at = now(),
      resolution_note = p_note, updated_at = now()
  where id = p_report_id and status in ('open', 'reviewing')
  returning * into r;
  if not found then
    raise exception 'that report is closed or does not exist' using errcode = '22023';
  end if;
  perform public.log_moderation_action('dismiss_report', 'report', r.id, r.id, p_note);
  return public.report_item(r);
end;
$$;

-- 10. Staff: actions on content and people. Each needs a reason (shown to the person where it
--     reaches them, and kept in the audit log), closes the open reports on that thing as actioned
--     (and p_report_id, if given), and returns {"ok": true, "reports_closed": n}.
create function public.staff_hide_post(p_post_id uuid, p_reason text, p_report_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  perform public.require_staff();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  update public.posts set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = p_reason
  where id = p_post_id and hidden_at is null;
  if not found and not exists (select 1 from public.posts where id = p_post_id) then
    raise exception 'that post does not exist' using errcode = '22023';
  end if;
  v_n := public.close_reports('post', p_post_id, 'actioned', p_reason, p_report_id);
  perform public.log_moderation_action('hide_post', 'post', p_post_id, p_report_id, p_reason);
  return jsonb_build_object('ok', true, 'reports_closed', v_n);
end;
$$;

create function public.staff_unhide_post(p_post_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  update public.posts set hidden_at = null, hidden_by = null, hidden_reason = null
  where id = p_post_id;
  if not found then
    raise exception 'that post does not exist' using errcode = '22023';
  end if;
  perform public.log_moderation_action('unhide_post', 'post', p_post_id, null, p_reason);
  return jsonb_build_object('ok', true, 'reports_closed', 0);
end;
$$;

create function public.staff_remove_comment(p_comment_id uuid, p_reason text, p_report_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  perform public.require_staff();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  update public.post_comments set removed_at = now(), removed_by = auth.uid(), removed_reason = p_reason
  where id = p_comment_id and removed_at is null;
  if not found and not exists (select 1 from public.post_comments where id = p_comment_id) then
    raise exception 'that comment does not exist' using errcode = '22023';
  end if;
  v_n := public.close_reports('comment', p_comment_id, 'actioned', p_reason, p_report_id);
  perform public.log_moderation_action('remove_comment', 'comment', p_comment_id, p_report_id, p_reason);
  return jsonb_build_object('ok', true, 'reports_closed', v_n);
end;
$$;

create function public.staff_restore_comment(p_comment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  update public.post_comments set removed_at = null, removed_by = null, removed_reason = null
  where id = p_comment_id;
  if not found then
    raise exception 'that comment does not exist' using errcode = '22023';
  end if;
  perform public.log_moderation_action('restore_comment', 'comment', p_comment_id, null, p_reason);
  return jsonb_build_object('ok', true, 'reports_closed', 0);
end;
$$;

-- Warn, suspend, ban. A warning shows in the person's app (get_my_standing) and changes nothing
-- else. Reports on the person and on anything of theirs named by p_report_id are closed.
create function public.sanction_user(
  p_kind text, p_user_id uuid, p_reason text, p_ends_at timestamptz, p_report_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'that person does not exist' using errcode = '22023';
  end if;
  if public.staff_role(p_user_id) is not null and p_kind <> 'warning' then
    raise exception 'staff cannot be suspended or banned here' using errcode = '22023';
  end if;
  insert into public.user_sanctions (user_id, kind, reason, report_id, created_by, ends_at)
  values (p_user_id, p_kind, p_reason, p_report_id, auth.uid(), p_ends_at);
  if p_kind in ('suspension', 'ban') then
    update public.profiles set is_banned = true where id = p_user_id;
  end if;
  v_n := public.close_reports('user', p_user_id, 'actioned', p_reason, p_report_id);
  perform public.log_moderation_action(
    case p_kind when 'warning' then 'warn_user' when 'suspension' then 'suspend_user' else 'ban_user' end,
    'user', p_user_id, p_report_id, p_reason,
    case when p_ends_at is not null then jsonb_build_object('ends_at', p_ends_at) else '{}'::jsonb end);
  return jsonb_build_object('ok', true, 'reports_closed', v_n);
end;
$$;

create function public.staff_warn_user(p_user_id uuid, p_reason text, p_report_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  return public.sanction_user('warning', p_user_id, p_reason, null, p_report_id);
end;
$$;

-- p_days: 1 to 365.
create function public.staff_suspend_user(
  p_user_id uuid, p_reason text, p_days int, p_report_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_staff();
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'a suspension is 1 to 365 days' using errcode = '22023';
  end if;
  return public.sanction_user('suspension', p_user_id, p_reason,
                              now() + make_interval(days => p_days), p_report_id);
end;
$$;

create function public.staff_ban_user(p_user_id uuid, p_reason text, p_report_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_staff(true);
  return public.sanction_user('ban', p_user_id, p_reason, null, p_report_id);
end;
$$;

-- Lifts every suspension and ban on the person. Admins only.
create function public.staff_unban_user(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_staff(true);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  update public.profiles set is_banned = false where id = p_user_id;
  if not found then
    raise exception 'that person does not exist' using errcode = '22023';
  end if;
  update public.user_sanctions set lifted_at = now(), lifted_by = auth.uid()
  where user_id = p_user_id and kind in ('suspension', 'ban') and lifted_at is null;
  perform public.log_moderation_action('unban_user', 'user', p_user_id, null, p_reason);
  return jsonb_build_object('ok', true, 'reports_closed', 0);
end;
$$;

-- Suspensions end on their own (run by cron every 5 minutes). A ban, or a longer suspension still
-- running, keeps the person banned.
create function public.lift_ended_suspensions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users uuid[];
begin
  with ended as (
    update public.user_sanctions set lifted_at = now()
    where kind = 'suspension' and lifted_at is null and ends_at <= now()
    returning user_id
  )
  select array_agg(distinct user_id) into v_users from ended;
  if v_users is null then
    return;
  end if;
  update public.profiles p set is_banned = false
  where p.id = any(v_users)
    and not exists (select 1 from public.user_sanctions s
                    where s.user_id = p.id and s.kind in ('suspension', 'ban') and s.lifted_at is null);
end;
$$;
select cron.schedule('lift-ended-suspensions', '*/5 * * * *', $$select public.lift_ended_suspensions()$$);

-- 11. Hidden posts and removed comments are left out of the feed, profiles and counts. These are
--     the bodies from 20260917114517_feed_lock (get_feed, get_user_posts, can_view_post_object),
--     20261002170000_mahi_points (feed_item) and 20260412182035 (get_feed_posts, older apps), each
--     with only that filter added.
create or replace function public.feed_item(p public.posts, p_viewer uuid, p_hide boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'created_at', p.created_at,
    'post_date', p.post_date,
    'streak_day', p.streak_day,
    'locked', p_hide,
    'image_path', case when p_hide then null else p.image_path end,
    'pov_image_path', case when p_hide then null else p.pov_image_path end,
    'rear_media_type', case when p_hide then null else p.rear_media_type end,
    'front_media_type', case when p_hide then null else p.front_media_type end,
    'caption', case when p_hide then null else p.caption end,
    'latitude', case when p_hide then null else p.latitude end,
    'longitude', case when p_hide then null else p.longitude end,
    'like_count', (select count(*) from public.post_likes l where l.post_id = p.id),
    'comment_count', (select count(*) from public.post_comments c
                      where c.post_id = p.id and c.removed_at is null),
    'liked_by_me', exists (
      select 1 from public.post_likes l where l.post_id = p.id and l.user_id = p_viewer
    ),
    'tagged_users', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', tp.id, 'username', tp.username,
               'display_name', tp.display_name, 'avatar_url', tp.avatar_url
             ) order by tp.username)
      from public.post_tags pt
      join public.profiles tp on tp.id = pt.user_id
      where pt.post_id = p.id
    ), '[]'::jsonb),
    'response', (
      select jsonb_build_object(
               'tagger_username', t.username,
               'seconds', extract(epoch from c.answered_at - c.created_at)::int)
      from public.tag_challenges c
      join public.profiles t on t.id = c.tagger_id
      where c.answered_post_id = p.id
      order by c.created_at
      limit 1
    ),
    'profile', (
      select jsonb_build_object(
               'id', pr.id, 'username', pr.username,
               'display_name', pr.display_name, 'avatar_url', pr.avatar_url,
               'points', pr.streak_current)
      from public.profiles pr
      where pr.id = p.user_id
    )
  );
$$;

create or replace function public.get_feed(
  p_limit int default 20,
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_locked boolean;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  v_locked := public.viewer_is_locked(v_uid);

  select coalesce(
           jsonb_agg(public.feed_item(s.p, v_uid, v_locked and (s.p).user_id <> v_uid)
                     order by (s.p).created_at desc, (s.p).id desc),
           '[]'::jsonb)
  into v_items
  from (
    select p
    from public.posts p
    join public.profiles pr on pr.id = p.user_id and not pr.is_banned
    where p.hidden_at is null
      and (
        p.user_id = v_uid
        or exists (
          select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p.user_id
        )
      )
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_uid)
      )
      and (p_cursor_ts is null or (p.created_at, p.id) < (p_cursor_ts, p_cursor_id))
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) s;

  return jsonb_build_object(
    'locked', v_locked,
    'unlocked_until', public.viewer_unlocked_until(v_uid),
    'server_now', now(),
    'items', v_items
  );
end;
$$;

create or replace function public.get_user_posts(
  p_user uuid,
  p_limit int default 30,
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hide boolean;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_uid <> p_user and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = p_user)
       or (b.blocker_id = p_user and b.blocked_id = v_uid)
  ) then
    return jsonb_build_object('locked', true, 'items', '[]'::jsonb);
  end if;
  v_hide := not public.can_view_post(v_uid, p_user);

  select coalesce(
           jsonb_agg(public.feed_item(s.p, v_uid, v_hide)
                     order by (s.p).created_at desc, (s.p).id desc),
           '[]'::jsonb)
  into v_items
  from (
    select p
    from public.posts p
    where p.user_id = p_user
      and p.hidden_at is null
      and (p_cursor_ts is null or (p.created_at, p.id) < (p_cursor_ts, p_cursor_id))
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) s;

  return jsonb_build_object('locked', v_hide, 'items', v_items);
end;
$$;

-- For the storage read rule (once the bucket is private): your own files, a post you may see
-- that isn't hidden, or anything for staff.
create or replace function public.can_view_post_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select split_part(p_name, '/', 1) = auth.uid()::text
      or public.is_staff()
      or exists (
        select 1 from public.posts p
        where (p.image_path = p_name or p.pov_image_path = p_name)
          and p.hidden_at is null
          and public.can_view_post(auth.uid(), p.user_id)
      );
$$;

create or replace function public.get_feed_posts(
  p_limit integer,
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null
)
returns table(id uuid, user_id uuid, image_url text, pov_image_url text, caption text,
              streak_day integer, created_at timestamptz, profile_id uuid, username text,
              display_name text, avatar_url text, like_count bigint, comment_count bigint,
              liked_by_me boolean, tagged_users jsonb)
language sql
stable
security definer
as $$
  select
    p.id,
    p.user_id,
    p.image_url,
    p.pov_image_url,
    p.caption,
    p.streak_day,
    p.created_at,
    pr.id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    (select count(*) from public.post_likes    l where l.post_id = p.id),
    (select count(*) from public.post_comments c where c.post_id = p.id and c.removed_at is null),
    exists(select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user_id',      pt.user_id,
            'username',     tp.username,
            'display_name', tp.display_name,
            'avatar_url',   tp.avatar_url
          )
          order by tp.username
        )
        from public.post_tags pt
        join public.profiles  tp on tp.id = pt.user_id
        where pt.post_id = p.id
      ),
      '[]'::jsonb
    )
  from public.posts    p
  join public.profiles pr on pr.id = p.user_id
  where (
    p_cursor_ts is null
    or p.created_at < p_cursor_ts
    or (p.created_at = p_cursor_ts and p.id < p_cursor_id)
  )
  and p.hidden_at is null
  and p.user_id not in (
    select blocked_id from public.user_blocks where blocker_id = auth.uid()
    union
    select blocker_id from public.user_blocks where blocked_id = auth.uid()
  )
  and pr.is_banned = false
  order by p.created_at desc, p.id desc
  limit p_limit;
$$;

-- 12. The AI check. Every new post and comment gets a row here; the moderate-content function
--     (supabase/functions/moderate-content) picks them up, asks OpenAI's moderation model, and
--     writes the result back. With no OPENAI_API_KEY it marks them 'skipped' and logs it.
--     Nothing is sent anywhere until the owner sets the two Vault secrets moderate_content_url
--     and moderate_content_secret (docs/moderation.md); until then rows simply wait, and rows
--     older than 7 days are closed as 'skipped' instead of being checked late.
alter table public.app_config
  -- 'block'-level verdicts hide the post / remove the comment straight away (logged as an AI
  -- action). Off: every verdict only goes to the staff list.
  add column ai_auto_hide boolean not null default false;

create table public.moderation_scans (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'skipped', 'error')),
  decision text check (decision in ('clean', 'flag', 'block')),
  labels text[],
  scores jsonb,
  provider text,
  error text,
  attempts int not null default 0,
  claimed_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index moderation_scans_pending on public.moderation_scans (created_at) where status = 'pending';
create index moderation_scans_target on public.moderation_scans (target_type, target_id);
alter table public.moderation_scans enable row level security;
revoke all on public.moderation_scans from anon, authenticated;
grant select on public.moderation_scans to authenticated;
create policy moderation_scans_staff_read on public.moderation_scans
  for select to authenticated using (public.is_staff());

create function public.queue_moderation_scan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.moderation_scans (target_type, target_id, user_id)
  values (case tg_table_name when 'posts' then 'post' else 'comment' end, new.id, new.user_id);
  return new;
exception when others then
  -- Never let the check stop someone posting.
  raise notice 'moderation scan not queued: %', sqlerrm;
  return new;
end;
$$;
create trigger queue_moderation_scan after insert on public.posts
  for each row execute function public.queue_moderation_scan();
create trigger queue_moderation_scan after insert on public.post_comments
  for each row execute function public.queue_moderation_scan();

-- For the function (service role): up to p_limit waiting checks with what to look at. A claim
-- lasts 5 minutes, then the row can be picked up again (at most 3 tries).
create function public.claim_moderation_batch(p_limit int default 20)
returns table (id bigint, target_type text, target_id uuid, body text, media jsonb)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  update public.moderation_scans s
  set status = 'skipped', error = 'too old', done_at = now()
  where s.status = 'pending' and s.created_at < now() - interval '7 days';
  update public.moderation_scans s
  set status = 'error', error = coalesce(s.error, 'gave up after 3 tries'), done_at = now()
  where s.status = 'pending' and s.attempts >= 3;

  return query
  with due as (
    select s.id from public.moderation_scans s
    where s.status = 'pending'
      and (s.claimed_at is null or s.claimed_at < now() - interval '5 minutes')
    order by s.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  ),
  claimed as (
    update public.moderation_scans s
    set claimed_at = now(), attempts = s.attempts + 1
    from due where s.id = due.id
    returning s.id, s.target_type, s.target_id
  )
  select c.id, c.target_type, c.target_id,
         case c.target_type
           when 'post' then (select p.caption from public.posts p where p.id = c.target_id)
           else (select x.content from public.post_comments x where x.id = c.target_id)
         end,
         case c.target_type
           when 'post' then (
             select coalesce(jsonb_agg(m.item) filter (where m.item is not null), '[]'::jsonb)
             from public.posts p
             cross join lateral (values
               (case when p.image_path is not null then
                  jsonb_build_object('path', p.image_path, 'type', p.rear_media_type) end),
               (case when p.pov_image_path is not null then
                  jsonb_build_object('path', p.pov_image_path, 'type', p.front_media_type) end)
             ) m(item)
             where p.id = c.target_id)
           else '[]'::jsonb
         end
  from claimed c;
end;
$$;

-- For the function: the result of one check. p_status: done | skipped | error. A 'flag' or
-- 'block' puts an AI report on the staff list (one per post or comment); with
-- app_config.ai_auto_hide on, a 'block' also hides the post or removes the comment.
create function public.complete_moderation_scan(
  p_scan_id bigint,
  p_status text,
  p_decision text default null,
  p_labels text[] default null,
  p_scores jsonb default null,
  p_provider text default null,
  p_error text default null,
  p_reason text default 'other'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.moderation_scans;
  v_report uuid;
  v_note text;
begin
  update public.moderation_scans
  set status = case when p_status = 'error' and attempts < 3 then 'pending' else p_status end,
      decision = p_decision, labels = p_labels, scores = p_scores, provider = p_provider,
      error = p_error, done_at = case when p_status = 'error' and attempts < 3 then null else now() end
  where id = p_scan_id
  returning * into s;
  if not found or p_status <> 'done' or coalesce(p_decision, '') not in ('flag', 'block') then
    return;
  end if;
  -- Gone already (deleted by its author): nothing to report.
  if (s.target_type = 'post' and not exists (select 1 from public.posts where id = s.target_id))
     or (s.target_type = 'comment' and not exists (select 1 from public.post_comments where id = s.target_id)) then
    return;
  end if;

  insert into public.user_reports (reporter_id, source, reason, description, ai_labels, ai_scores,
                                   reported_post_id, reported_comment_id)
  values (null, 'ai',
          case when p_reason in ('spam', 'harassment', 'hate_speech', 'sexual_content', 'violence',
                                 'self_harm', 'scam', 'impersonation', 'underage',
                                 'inappropriate_content', 'other') then p_reason else 'other' end,
          'Flagged by the automatic check (' || p_decision || '): '
            || coalesce(array_to_string(p_labels, ', '), ''),
          p_labels, p_scores,
          case when s.target_type = 'post' then s.target_id end,
          case when s.target_type = 'comment' then s.target_id end)
  on conflict do nothing
  returning id into v_report;

  if p_decision = 'block' and (select ai_auto_hide from public.app_config) then
    v_note := 'Hidden by the automatic check: ' || coalesce(array_to_string(p_labels, ', '), '');
    if s.target_type = 'post' then
      update public.posts set hidden_at = now(), hidden_reason = v_note
      where id = s.target_id and hidden_at is null;
      perform public.log_moderation_action('ai_hide_post', 'post', s.target_id, v_report, v_note,
                                           jsonb_build_object('scan_id', s.id));
    else
      update public.post_comments set removed_at = now(), removed_reason = v_note
      where id = s.target_id and removed_at is null;
      perform public.log_moderation_action('ai_remove_comment', 'comment', s.target_id, v_report, v_note,
                                           jsonb_build_object('scan_id', s.id));
    end if;
  end if;
end;
$$;

-- Every minute, if checks are waiting and the owner has set the Vault secrets, wake the function
-- (same pattern as invoke_send_push).
create function public.invoke_moderate_content()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.moderation_scans where status = 'pending') then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'moderate_content_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'moderate_content_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Internal-Secret', v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;
select cron.schedule('moderate-content', '* * * * *', $$select public.invoke_moderate_content()$$);

-- 13. Who may call what.
revoke execute on function
  public.staff_role(uuid),
  public.is_staff(),
  public.my_staff_role(),
  public.require_staff(boolean),
  public.protect_moderation_columns(),
  public.user_reports_fill(),
  public.log_moderation_action(text, text, uuid, uuid, text, jsonb),
  public.close_reports(text, uuid, text, text, uuid),
  public.file_report(text, uuid, text, text),
  public.report_user(uuid, text, text),
  public.report_post(uuid, text, text),
  public.report_comment(uuid, text, text),
  public.report_message(uuid, text, text),
  public.get_my_standing(),
  public.mark_warnings_seen(),
  public.report_item(public.user_reports),
  public.staff_get_queue(text, text, int, timestamptz),
  public.staff_get_report(uuid),
  public.staff_review_report(uuid),
  public.staff_dismiss_report(uuid, text),
  public.staff_hide_post(uuid, text, uuid),
  public.staff_unhide_post(uuid, text),
  public.staff_remove_comment(uuid, text, uuid),
  public.staff_restore_comment(uuid, text),
  public.sanction_user(text, uuid, text, timestamptz, uuid),
  public.staff_warn_user(uuid, text, uuid),
  public.staff_suspend_user(uuid, text, int, uuid),
  public.staff_ban_user(uuid, text, uuid),
  public.staff_unban_user(uuid, text),
  public.lift_ended_suspensions(),
  public.queue_moderation_scan(),
  public.claim_moderation_batch(int),
  public.complete_moderation_scan(bigint, text, text, text[], jsonb, text, text, text),
  public.invoke_moderate_content()
from public, anon, authenticated;

grant execute on function
  public.is_staff(),
  public.my_staff_role(),
  public.report_user(uuid, text, text),
  public.report_post(uuid, text, text),
  public.report_comment(uuid, text, text),
  public.report_message(uuid, text, text),
  public.get_my_standing(),
  public.mark_warnings_seen(),
  public.staff_get_queue(text, text, int, timestamptz),
  public.staff_get_report(uuid),
  public.staff_review_report(uuid),
  public.staff_dismiss_report(uuid, text),
  public.staff_hide_post(uuid, text, uuid),
  public.staff_unhide_post(uuid, text),
  public.staff_remove_comment(uuid, text, uuid),
  public.staff_restore_comment(uuid, text),
  public.staff_warn_user(uuid, text, uuid),
  public.staff_suspend_user(uuid, text, int, uuid),
  public.staff_ban_user(uuid, text, uuid),
  public.staff_unban_user(uuid, text)
to authenticated;

grant execute on function
  public.claim_moderation_batch(int),
  public.complete_moderation_scan(bigint, text, text, text[], jsonb, text, text, text)
to service_role;

notify pgrst, 'reload schema';
