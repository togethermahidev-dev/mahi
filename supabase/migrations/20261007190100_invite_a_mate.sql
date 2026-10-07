-- Invite a mate any time (owner, 2026-10-07). Someone with no tag to answer can still send a link
-- to bring a mate in, from the camera's "Waiting for a mate to tag you" card.
--   * The link has no tag behind it (invites.challenge_id is null): it is never a tag slot, so the
--     inviter's next post doesn't drop it and expire_invites has nothing of it to cancel. It just
--     stops working after invite_ttl (7 days), as every link does.
--   * Joining from it (claim_invite, unchanged) makes the two follow each other and starts no
--     48-hour tag: there is no post. The inviter hears "joined Mahi from your invite. You follow
--     each other now."
--   * It counts towards max_open_invites until it is used or runs out, and needs invite links on.
--   * The invite page and the join result say whether a tag comes with a link ('tag'), so the app
--     never promises a tag that won't start.
-- Tag slot links (make_invite_link) are unchanged and still need a tag to answer.
-- Test: supabase/tests/invite_a_mate_test.sql
-- Undo: supabase/rollbacks/20261007190100_invite_a_mate.rollback.sql

-- 1. A link may have no tag behind it.
alter table public.invites alter column challenge_id drop not null;

-- 2. Open invites: slots still waiting (as before) plus links for a mate nobody has used yet.
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
       + (select count(*) from public.invites
          where inviter_id = p_user and challenge_id is null
            and claimed_at is null and expires_at > now())::int;
$$;

-- 3. A link for a mate, made on tap. Any time: no tag to answer needed.
create function public.make_mate_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.app_config;
  v_inv public.invites;
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
  if not v_cfg.invite_links_enabled then
    raise exception 'invite links are off' using errcode = '22023';
  end if;
  if public.open_invite_count(v_uid) >= v_cfg.max_open_invites then
    raise exception 'too many open invites' using errcode = '22023';
  end if;

  insert into public.invites (token, code, inviter_id, challenge_id, expires_at)
  values (encode(extensions.gen_random_bytes(16), 'hex'), public.new_invite_code(), v_uid,
          null, now() + v_cfg.invite_ttl)
  returning * into v_inv;

  return jsonb_build_object(
    'token', v_inv.token,
    'code', v_inv.code,
    'url', v_cfg.invite_base_url || v_inv.token);
end;
$$;

-- 4. What the app shows once an invite is claimed (20260917121508_invites' body, plus 'tag':
--    a tag comes with this link — false for a link for a mate, or a slot that was dropped).
create or replace function public.invite_result(i public.invites)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'claimed', i.claimed_at is not null,
    'inviter', jsonb_build_object(
      'id', p.id, 'username', p.username,
      'display_name', p.display_name, 'avatar_url', p.avatar_url),
    'expires_at', c.expires_at,
    'tag', c.id is not null and c.cancelled_at is null,
    'server_now', now())
  from public.profiles p
  left join public.tag_challenges c on c.id = i.challenge_id
  where p.id = i.inviter_id;
$$;

-- 5. Who sent the link, before anyone signs in (20260917121508_invites' body, plus 'tag').
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
    'open', i.claimed_at is null and i.expires_at > now(),
    'tag', c.id is not null and c.cancelled_at is null)
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and not p.is_banned
  left join public.tag_challenges c on c.id = i.challenge_id
  where i.token = p_token or lower(i.code) = lower(btrim(coalesce(p_token, '')));
$$;

-- 6. Who may call what.
revoke execute on function public.make_mate_invite() from public, anon, authenticated;
grant execute on function public.make_mate_invite() to authenticated;

notify pgrst, 'reload schema';
