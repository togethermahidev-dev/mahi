-- Undo 20261007190100_invite_a_mate: no more links for a mate without a tag.
-- Links for a mate already made are DELETED (used ones too, so the founder's invite counts drop by
-- that many); the follows they made stay. Older apps that call make_mate_invite get an error.
begin;

drop function public.make_mate_invite();

delete from public.invites where challenge_id is null;
alter table public.invites alter column challenge_id set not null;

create or replace function public.open_invite_count(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.tag_challenges
  where tagger_id = p_user and expires_at is null
    and cancelled_at is null and answered_at is null and missed_at is null;
$$;

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
    'server_now', now())
  from public.profiles p
  left join public.tag_challenges c on c.id = i.challenge_id
  where p.id = i.inviter_id;
$$;

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
    'open', i.claimed_at is null and i.expires_at > now())
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and not p.is_banned
  where i.token = p_token or lower(i.code) = lower(btrim(coalesce(p_token, '')));
$$;

notify pgrst, 'reload schema';
commit;
