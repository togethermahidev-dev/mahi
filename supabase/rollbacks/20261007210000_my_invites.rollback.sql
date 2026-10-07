-- Undo 20261007210000_my_invites: no invites list, no sending again, no cancelling.
-- Links cancelled so far stay dead: their expires_at is moved to when they were cancelled before
-- the column goes. Links sent again keep their later expires_at. Older apps that call the three
-- functions get an error.
begin;

drop function public.get_my_invites();
drop function public.resend_invite(text);
drop function public.cancel_invite(text);
drop function public.invite_rows(uuid, text);

update public.invites set expires_at = least(expires_at, cancelled_at) where cancelled_at is not null;

-- 20261007190100_invite_a_mate's body.
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

-- 20261007190100_invite_a_mate's body.
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

-- 20261003120000_tag_slots' body.
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
  if v_inv.expires_at < now() then
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

alter table public.invites
  drop column cancelled_at,
  drop column send_count,
  drop column last_sent_at;
alter table public.app_config
  drop column max_resends,
  drop column resend_after;

notify pgrst, 'reload schema';
commit;
