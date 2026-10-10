-- A profile gets a bio, and follower / following counts stop at a block (owner, 2026-10-10:
-- "Should this be added- yes").
-- 1. public.profile_bios: one row per person who has a bio (no row = none), 150 characters at
--    most. It is its own table, not a column on profiles, because "profiles_select_authenticated"
--    lets every signed-in person read the whole profiles row, blocked or not, so a column there
--    could never be kept from someone on the other side of a block (date of birth and phone
--    number moved to profile_private for the same reason). The app has no rights on it at all.
-- 2. set_bio(p_bio): the only way to change a bio, and only your own (the caller is auth.uid();
--    there is no user id to pass). Invisible and direction-flipping characters go, line breaks and
--    runs of spaces become one space, the ends are trimmed; nothing left = no bio; more than 150
--    characters is refused with 22023 'bio is too long: 150 characters at most'; a banned or
--    suspended account is refused like every other profile write (42501 'not allowed'). Answers
--    {"bio": the saved text or null}.
-- 3. get_profile_about(p_user): {"bio", "lists_open"} for a profile's header. The bio goes to
--    anyone signed in who may see the profile's name (a private account's name and photo show to
--    everyone, and so does its bio), never across a block either way, and never for a banned
--    account or an unknown id (the same empty answer as "no bio", so nothing is given away).
--    lists_open is can_see_follow_lists(p_user): whether the caller may open that person's
--    follower and following lists (always true for your own).
-- 4. get_follow_data: follower_count and following_count come back null across a block (they
--    were returned to anyone signed in). Everything else about it is unchanged, from
--    20261008170000_private_accounts.
-- Test: supabase/tests/profile_bio_test.sql
-- Undo: supabase/rollbacks/20261010110000_profile_bio.rollback.sql

create table public.profile_bios (
  id         uuid primary key references public.profiles(id) on delete cascade,
  bio        text not null check (char_length(bio) between 1 and 150),
  updated_at timestamptz not null default now()
);

alter table public.profile_bios enable row level security;
-- No policies and no grants: only the two functions below (running as the owner) touch it.
revoke all on public.profile_bios from public, anon, authenticated;

create function public.set_bio(p_bio text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bio text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and not is_banned) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Out: control characters, zero-width and blank fillers, direction marks and overrides. Kept:
  -- the joiners and variation selectors that emoji and some scripts are built with.
  v_bio := regexp_replace(
    coalesce(p_bio, ''),
    '[\u0001-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u2800\u3164\uFEFF\uFFA0]',
    '', 'g');
  -- Every kind of space and line break, in any run, becomes one space.
  v_bio := btrim(regexp_replace(
    v_bio,
    '[\u0009-\u000D \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+',
    ' ', 'g'));
  -- Only joiners and selectors left: nothing anyone could see.
  if regexp_replace(v_bio, '[ \u200C\u200D\uFE00-\uFE0F]', '', 'g') = '' then
    v_bio := '';
  end if;

  if char_length(v_bio) > 150 then
    raise exception 'bio is too long: 150 characters at most' using errcode = '22023';
  end if;

  if v_bio = '' then
    delete from public.profile_bios where id = v_uid;
  else
    insert into public.profile_bios (id, bio)
    values (v_uid, v_bio)
    on conflict (id) do update set bio = excluded.bio, updated_at = now();
  end if;

  return jsonb_build_object('bio', nullif(v_bio, ''));
end;
$$;

create function public.get_profile_about(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_user = v_uid then
    return jsonb_build_object(
      'bio', (select b.bio from public.profile_bios b where b.id = v_uid),
      'lists_open', true);
  end if;
  -- A block either way, a banned account, nobody: the same answer as someone with no bio.
  if p_user is null
     or exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_user)
          or (b.blocker_id = p_user and b.blocked_id = v_uid))
     or not exists (select 1 from public.profiles pr where pr.id = p_user and not pr.is_banned) then
    return jsonb_build_object('bio', null, 'lists_open', false);
  end if;
  return jsonb_build_object(
    'bio', (select b.bio from public.profile_bios b where b.id = p_user),
    'lists_open', coalesce(public.can_see_follow_lists(p_user), false));
end;
$$;

revoke execute on function public.set_bio(text), public.get_profile_about(uuid) from public, anon;
grant execute on function public.set_bio(text), public.get_profile_about(uuid) to authenticated;

-- p_current_user_id stays for apps already on phones; the answer is always the caller's. New:
-- the two counts are null when the caller and the target have a block between them.
create or replace function public.get_follow_data(p_current_user_id uuid, p_target_user_id uuid)
returns table (
  is_following boolean,
  follower_count bigint,
  following_count bigint,
  follows_you boolean,
  requested boolean,
  is_private boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_blocked boolean;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  v_blocked := exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = p_target_user_id)
       or (b.blocker_id = p_target_user_id and b.blocked_id = v_uid));
  return query
  select
    v_uid <> p_target_user_id and exists (
      select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p_target_user_id),
    case when v_blocked then null
         else (select count(*) from public.follows f where f.following_id = p_target_user_id) end,
    case when v_blocked then null
         else (select count(*) from public.follows f where f.follower_id = p_target_user_id) end,
    v_uid <> p_target_user_id and exists (
      select 1 from public.follows f where f.follower_id = p_target_user_id and f.following_id = v_uid),
    exists (
      select 1 from public.follow_requests r
      where r.requester_id = v_uid and r.target_id = p_target_user_id),
    coalesce((select pr.is_private from public.profiles pr where pr.id = p_target_user_id), false);
end;
$$;

notify pgrst, 'reload schema';
