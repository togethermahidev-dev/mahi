-- Undo 20261009120000_feed_lock_reason: get_feed as 20261008170000_private_accounts (no
-- open_tags or posted_before in its answer).
begin;

create or replace function public.get_feed(
  p_limit integer default 20,
  p_cursor_ts timestamp with time zone default null,
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
        or (
          exists (
            select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p.user_id
          )
          -- The owner's workouts setting (friends-only drops one-way followers); a locked feed
          -- still shows padlocks, as before.
          and public.posts_visibility_allows(v_uid, p.user_id)
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

delete from supabase_migrations.schema_migrations where version = '20261009120000';

commit;
