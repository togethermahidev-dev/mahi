-- The feed read says why it is locked (owner, 2026-10-09: "if it's locked it'll know surely?"). The
-- locked panel needed a second read (get_open_tags) for its words and showed nothing when that read
-- failed. get_feed now also returns 'open_tags' (the caller's own open tags, the same rows as
-- get_open_tags, soonest first) and 'posted_before'. Everything else is as
-- 20261008170000_private_accounts.
-- Test: supabase/tests/feed_lock_reason_test.sql
-- Undo: supabase/rollbacks/20261009120000_feed_lock_reason.rollback.sql
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
    'items', v_items,
    -- Why it's locked, in the same read (2026-10-09): your own open tags, soonest first, and
    -- whether you have posted before. The same rows get_open_tags returns.
    'open_tags', (select coalesce(jsonb_agg(to_jsonb(t) order by t.expires_at), '[]'::jsonb)
                  from public.get_open_tags() t),
    'posted_before', (select coalesce(has_posted_before, false) from public.profiles where id = v_uid)
  );
end;
$$;
