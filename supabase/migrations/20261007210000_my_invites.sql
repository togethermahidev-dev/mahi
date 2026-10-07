-- Your invites (owner, 2026-10-07): "Let the user see who they have invited ... show if the person
-- joins through their invite link; if they wish, resend the invite after a certain timeframe, rate
-- limited so it can't be abused, idempotent; they can cancel an invite."
--   * get_my_invites: your links (for a mate and for a tag slot) from the last 30 days, newest
--     first: waiting | joined (and who) | expired | cancelled, and when each can be sent again.
--   * resend_invite: a link nobody has used, sent again: open for another invite_ttl (7 days).
--     Once a day per link (resend_after) and at most max_resends (3) times. A link that ran out
--     can be sent again; it then counts as open again, under max_open_invites. Asking again too
--     soon changes nothing and says so ('resent': false), so a double tap or a retry is safe.
--   * cancel_invite: a link nobody has used stops working, the same as one that ran out (joining
--     says 'that invite has expired', the invite page says closed). A tag slot's link takes its
--     slot back too (cancel_tag_slot's rule, also for a slot already on a post, as
--     expire_invites does). Cancelling twice gives the same answer.
-- Test: supabase/tests/my_invites_test.sql
-- Undo: supabase/rollbacks/20261007210000_my_invites.rollback.sql

-- 1. Settings. Changing one is a one-line migration: update public.app_config set max_resends = 5;
alter table public.app_config
  add column resend_after interval not null default '24 hours',
  add column max_resends int not null default 3
    constraint app_config_max_resends_not_negative check (max_resends >= 0);

-- 2. When a link was last sent, how many times, and whether it was cancelled.
alter table public.invites
  add column last_sent_at timestamptz,
  add column send_count int not null default 1,
  add column cancelled_at timestamptz;
update public.invites set last_sent_at = created_at;
alter table public.invites
  alter column last_sent_at set default now(),
  alter column last_sent_at set not null;

-- 3. Open invites (20261007190100_invite_a_mate's body, plus): a cancelled link for a mate never
--    counts, and a link sent again counts while open even when no slot of its is waiting (a slot
--    dropped at posting, or cleared when its link ran out).
create or replace function public.open_invite_count(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.tag_challenges
          where tagger_id = p_user and expires_at is null
            and cancelled_at is null and answered_at is null and missed_at is null)::int
       + (select count(*) from public.invites i
          where i.inviter_id = p_user
            and i.claimed_at is null and i.cancelled_at is null and i.expires_at > now()
            and (i.challenge_id is null
                 or (i.send_count > 1 and not exists (
                       select 1 from public.tag_challenges c
                       where c.id = i.challenge_id and c.expires_at is null
                         and c.cancelled_at is null and c.answered_at is null
                         and c.missed_at is null))))::int;
$$;

-- 4. One person's links as the app lists them (internal: get_my_invites, resend_invite and
--    cancel_invite hand these rows back). With a token: that link, however old.
create function public.invite_rows(p_user uuid, p_token text default null)
returns table (
  token text, code text, url text, kind text, status text,
  created_at timestamptz, expires_at timestamptz, last_sent_at timestamptz, send_count int,
  joined jsonb, can_resend boolean, resend_at timestamptz, server_now timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.token, i.code, cfg.invite_base_url || i.token,
         case when i.challenge_id is null then 'mate' else 'tag' end,
         s.status,
         i.created_at, i.expires_at, i.last_sent_at, i.send_count,
         case when i.claimed_at is not null and p.id is not null then
           jsonb_build_object('id', p.id, 'username', p.username,
                              'display_name', p.display_name, 'avatar_url', p.avatar_url) end,
         s.status in ('waiting', 'expired') and i.send_count <= cfg.max_resends
           and i.last_sent_at + cfg.resend_after <= now(),
         case when s.status in ('waiting', 'expired') and i.send_count <= cfg.max_resends
              then i.last_sent_at + cfg.resend_after end,
         now()
  from public.invites i
  cross join public.app_config cfg
  cross join lateral (
    select case when i.claimed_at is not null then 'joined'
                when i.cancelled_at is not null then 'cancelled'
                when i.expires_at <= now() then 'expired'
                else 'waiting' end as status
  ) s
  left join public.profiles p on p.id = i.claimed_by
  where i.inviter_id = p_user
    and (case when p_token is null
              then greatest(i.created_at, i.last_sent_at) >= now() - interval '30 days'
              else i.token = p_token end)
  order by i.created_at desc, i.token;
$$;

-- 5. Your invites, newest first.
create function public.get_my_invites()
returns table (
  token text, code text, url text, kind text, status text,
  created_at timestamptz, expires_at timestamptz, last_sent_at timestamptz, send_count int,
  joined jsonb, can_resend boolean, resend_at timestamptz, server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query select * from public.invite_rows(auth.uid());
end;
$$;

-- 6. Send a link again.
create function public.resend_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
  v_inv public.invites;
  v_before int;
  v_after int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;
  -- Serialise with everything else this user does (double taps, the cap).
  perform 1 from public.profiles where id = v_uid and not is_banned for update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_inv from public.invites
  where token = p_token and inviter_id = v_uid
  for update;
  if not found then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;
  if v_inv.claimed_at is not null then
    raise exception 'resend: already joined' using errcode = '22023';
  end if;
  if v_inv.cancelled_at is not null then
    raise exception 'resend: cancelled' using errcode = '22023';
  end if;
  -- Asked again too soon (a double tap, a retry): nothing changes, and it says so.
  if v_inv.last_sent_at + v_cfg.resend_after > now() then
    return jsonb_build_object(
      'resent', false,
      'reason', 'resend: too soon',
      'invite', (select to_jsonb(r) from public.invite_rows(v_uid, v_inv.token) r));
  end if;
  if v_inv.send_count > v_cfg.max_resends then
    raise exception 'resend: limit reached' using errcode = '22023';
  end if;
  if not v_cfg.invite_links_enabled then
    raise exception 'invite links are off' using errcode = '22023';
  end if;

  v_before := public.open_invite_count(v_uid);
  update public.invites
  set expires_at = now() + v_cfg.invite_ttl,
      last_sent_at = now(),
      send_count = send_count + 1
  where token = v_inv.token;
  -- A link that ran out (or wasn't counted) is open again: not past the cap. The raise undoes
  -- the update.
  v_after := public.open_invite_count(v_uid);
  if v_after > v_before and v_after > v_cfg.max_open_invites then
    raise exception 'too many open invites' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'resent', true,
    'reason', null,
    'invite', (select to_jsonb(r) from public.invite_rows(v_uid, v_inv.token) r));
end;
$$;

-- 7. Cancel a link nobody has used.
create function public.cancel_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invites;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- Locked, so a join racing the cancel waits for it (claim_invite locks the same row).
  select * into v_inv from public.invites
  where token = p_token and inviter_id = v_uid
  for update;
  if not found then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;
  if v_inv.claimed_at is not null then
    raise exception 'cancel: already joined' using errcode = '22023';
  end if;

  if v_inv.cancelled_at is null then
    update public.invites set cancelled_at = now() where token = v_inv.token;
    -- Its slot, if nobody is in it yet, is taken back (cancel_tag_slot's rule; also for a slot
    -- already on a post, as expire_invites clears one whose link ran out).
    update public.tag_challenges
    set cancelled_at = now()
    where id = v_inv.challenge_id
      and tagged_id is null and expires_at is null
      and cancelled_at is null and answered_at is null and missed_at is null;
  end if;

  return jsonb_build_object(
    'cancelled', true,
    'invite', (select to_jsonb(r) from public.invite_rows(v_uid, v_inv.token) r));
end;
$$;

-- 8. The invite page (20261007190100_invite_a_mate's body): a cancelled link is closed.
create or replace function public.get_invite_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'open', i.claimed_at is null and i.expires_at > now() and i.cancelled_at is null,
    'tag', c.id is not null and c.cancelled_at is null)
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and not p.is_banned
  left join public.tag_challenges c on c.id = i.challenge_id
  where i.token = p_token or lower(i.code) = lower(btrim(coalesce(p_token, '')));
$$;

-- 9. Joining (20261003120000_tag_slots' body): a cancelled link is refused like one that ran out.
create or replace function public.claim_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
  v_inv public.invites;
  v_c public.tag_challenges;
  v_me public.profiles;
  v_inviter public.profiles;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_cfg from public.app_config;
  select * into v_me from public.profiles where id = v_uid;
  if not found or v_me.is_banned then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_inv from public.invites
  where token = p_token or lower(code) = lower(btrim(coalesce(p_token, '')))
  for update;
  if not found then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;

  -- The same person claiming again gets the same answer, not a second tag.
  if v_inv.claimed_by = v_uid then
    return public.invite_result(v_inv);
  end if;
  if v_inv.claimed_at is not null then
    raise exception 'that invite has been used' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() or v_inv.cancelled_at is not null then
    raise exception 'that invite has expired' using errcode = '22023';
  end if;
  if v_inv.inviter_id = v_uid then
    raise exception 'that invite is your own' using errcode = '22023';
  end if;
  -- An invite is for someone new; an older account can't farm tags with one.
  if v_me.created_at < now() - interval '24 hours' then
    raise exception 'invites are for new accounts' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = v_inv.inviter_id)
       or (b.blocker_id = v_inv.inviter_id and b.blocked_id = v_uid)
  ) then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;

  select * into v_inviter from public.profiles where id = v_inv.inviter_id and not is_banned;
  if not found then
    raise exception 'that invite is not valid' using errcode = '22023';
  end if;

  -- The row is locked, so two people racing the same link: one wins here, the other saw
  -- claimed_at above or waits and then sees it.
  update public.invites set claimed_by = v_uid, claimed_at = now()
  where token = v_inv.token
  returning * into v_inv;

  -- Friends both ways, so they can tag each other from here on.
  insert into public.follows (follower_id, following_id)
  values (v_uid, v_inv.inviter_id), (v_inv.inviter_id, v_uid)
  on conflict do nothing;

  -- The slot gets its person. A slot taken back or dropped stays that way: friends, no tag.
  update public.tag_challenges
  set tagged_id = v_uid
  where id = v_inv.challenge_id
    and tagged_id is null and cancelled_at is null and answered_at is null
  returning * into v_c;
  if found then
    perform public.start_tag(v_c.id);
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, challenge_id)
  values (v_inv.inviter_id, v_uid, 'invite_joined', v_c.post_id, v_c.id);

  return public.invite_result(v_inv);
end;
$$;

-- 10. Who may call what.
revoke execute on function
  public.invite_rows(uuid, text),
  public.get_my_invites(),
  public.resend_invite(text),
  public.cancel_invite(text)
from public, anon, authenticated;

grant execute on function
  public.get_my_invites(),
  public.resend_invite(text),
  public.cancel_invite(text)
to authenticated;

notify pgrst, 'reload schema';
