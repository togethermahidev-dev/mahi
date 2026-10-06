-- Undo 20261006100000_moderation. Loses: every report's status, AI flags and post/comment/message
-- reports (user reports are kept), the staff list, all warnings / suspensions / bans and the audit
-- log, the AI check's queue. Hidden posts and removed comments become visible again. Anyone
-- suspended or banned through the portal stays banned (profiles.is_banned is not touched); clear
-- it by hand if wanted. Turn off any app or portal feature that calls these functions first.
begin;

select cron.unschedule('moderate-content');
select cron.unschedule('lift-ended-suspensions');

drop trigger queue_moderation_scan on public.posts;
drop trigger queue_moderation_scan on public.post_comments;
drop function public.invoke_moderate_content();
drop function public.complete_moderation_scan(bigint, text, text, text[], jsonb, text, text, text);
drop function public.claim_moderation_batch(int);
drop function public.queue_moderation_scan();
drop table public.moderation_scans;
alter table public.app_config drop column ai_auto_hide;

-- Feed and profile reads as before (bodies from 20260917114517_feed_lock,
-- 20261002170000_mahi_points and 20260412182035, unchanged apart from the hidden filter).
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
    'comment_count', (select count(*) from public.post_comments c where c.post_id = p.id),
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
    where (
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
      and (p_cursor_ts is null or (p.created_at, p.id) < (p_cursor_ts, p_cursor_id))
    order by p.created_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) s;

  return jsonb_build_object('locked', v_hide, 'items', v_items);
end;
$$;

create or replace function public.can_view_post_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select split_part(p_name, '/', 1) = auth.uid()::text
      or exists (
        select 1 from public.posts p
        where (p.image_path = p_name or p.pov_image_path = p_name)
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
    p.id, p.user_id, p.image_url, p.pov_image_url, p.caption, p.streak_day, p.created_at,
    pr.id, pr.username, pr.display_name, pr.avatar_url,
    (select count(*) from public.post_likes    l where l.post_id = p.id),
    (select count(*) from public.post_comments c where c.post_id = p.id),
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
  and p.user_id not in (
    select blocked_id from public.user_blocks where blocker_id = auth.uid()
    union
    select blocker_id from public.user_blocks where blocked_id = auth.uid()
  )
  and pr.is_banned = false
  order by p.created_at desc, p.id desc
  limit p_limit;
$$;

-- Staff actions, reporting calls and their helpers.
drop function public.lift_ended_suspensions();
drop function public.staff_unban_user(uuid, text);
drop function public.staff_ban_user(uuid, text, uuid);
drop function public.staff_suspend_user(uuid, text, int, uuid);
drop function public.staff_warn_user(uuid, text, uuid);
drop function public.sanction_user(text, uuid, text, timestamptz, uuid);
drop function public.staff_restore_comment(uuid, text);
drop function public.staff_remove_comment(uuid, text, uuid);
drop function public.staff_unhide_post(uuid, text);
drop function public.staff_hide_post(uuid, text, uuid);
drop function public.staff_dismiss_report(uuid, text);
drop function public.staff_review_report(uuid);
drop function public.staff_get_report(uuid);
drop function public.staff_get_queue(text, text, int, timestamptz);
drop function public.report_item(public.user_reports);
drop function public.mark_warnings_seen();
drop function public.get_my_standing();
drop function public.report_message(uuid, text, text);
drop function public.report_comment(uuid, text, text);
drop function public.report_post(uuid, text, text);
drop function public.report_user(uuid, text, text);
drop function public.file_report(text, uuid, text, text);
drop function public.close_reports(text, uuid, text, text, uuid);
drop function public.log_moderation_action(text, text, uuid, uuid, text, jsonb);
drop table public.moderation_actions;
drop table public.user_sanctions;

-- Reports back to users and posts only, as the app first made them.
drop policy user_reports_staff_read on public.user_reports;
drop trigger user_reports_fill on public.user_reports;
drop function public.user_reports_fill();
delete from public.user_reports where reporter_id is null or target_type in ('comment', 'message');
delete from public.user_reports a using public.user_reports b
where a.reporter_id = b.reporter_id and a.reported_user_id = b.reported_user_id and a.id > b.id;
drop index public.user_reports_one_per_reporter;
drop index public.user_reports_one_ai_flag;
drop index public.user_reports_queue;
drop index public.user_reports_target;
drop index public.user_reports_owner;
alter table public.user_reports
  drop constraint user_reports_target_type_check,
  drop constraint user_reports_reason_check,
  drop constraint user_reports_source_check,
  drop constraint user_reports_status_check,
  drop constraint user_reports_reporter_check,
  drop constraint user_reports_description_length,
  drop constraint user_reports_reported_post_id_fkey,
  drop column reported_comment_id,
  drop column reported_message_id,
  drop column target_type,
  drop column target_id,
  drop column target_owner_id,
  drop column snapshot,
  drop column source,
  drop column status,
  drop column ai_labels,
  drop column ai_scores,
  drop column reviewed_by,
  drop column reviewed_at,
  drop column resolution_note,
  drop column updated_at;
update public.user_reports set reason = 'other'
where reason not in ('spam', 'harassment', 'inappropriate_content', 'impersonation', 'other');
alter table public.user_reports
  alter column reporter_id set not null,
  add constraint user_reports_reported_post_id_fkey
    foreign key (reported_post_id) references public.posts(id) on delete cascade,
  add constraint user_reports_reason_check
    check (reason in ('spam', 'harassment', 'inappropriate_content', 'impersonation', 'other')),
  add constraint user_reports_unique_user unique (reporter_id, reported_user_id),
  add constraint user_reports_has_target
    check (reported_user_id is not null or reported_post_id is not null);
grant insert, update, delete on public.user_reports to anon, authenticated;

-- Content rules as before.
drop policy comments_insert on public.post_comments;
create policy comments_insert on public.post_comments
  for insert to authenticated with check (auth.uid() = user_id);
drop policy comments_select on public.post_comments;
create policy comments_select on public.post_comments for select to authenticated using (true);
drop policy posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated using (true);
drop trigger protect_moderation_columns on public.posts;
drop function public.protect_moderation_columns();
alter table public.posts drop column hidden_at, drop column hidden_by, drop column hidden_reason;
alter table public.post_comments drop column removed_at, drop column removed_by, drop column removed_reason;

drop function public.require_staff(boolean);
drop function public.my_staff_role();
drop function public.is_staff();
drop function public.staff_role(uuid);
drop table public.staff_users;

delete from supabase_migrations.schema_migrations where version = '20261006100000';
notify pgrst, 'reload schema';

commit;
