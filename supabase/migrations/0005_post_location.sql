-- ============================================================================
-- 0005_post_location.sql
-- Per-post location (roadmap 4.1). Adds optional latitude/longitude to posts.
-- Both columns are NULLABLE: posts created without location consent stay valid
-- and existing rows backfill as NULL. RLS is intentionally unchanged — see the
-- read-exposure note below.
-- ============================================================================

-- posts: add optional coordinates (one-shot GPS fix attached at post time)
alter table public.posts
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- WGS84 latitude in decimal degrees; NULL when the user did not opt in / no fix
comment on column public.posts.latitude is 'Optional WGS84 latitude (decimal degrees) of where the post was created; NULL when location consent was not granted.';

-- WGS84 longitude in decimal degrees; NULL when the user did not opt in / no fix
comment on column public.posts.longitude is 'Optional WGS84 longitude (decimal degrees) of where the post was created; NULL when location consent was not granted.';

-- ============================================================================
-- RLS: no new policy. The new columns are covered by the EXISTING
-- "Posts: SELECT all authenticated" policy (0002_rls.sql) — i.e. anyone who can
-- read a post can read its coordinates. This public read-exposure of per-post
-- coordinates is the documented, intentional privacy posture for roadmap 4.1:
-- location is strictly opt-in per post (captured client-side only with consent),
-- so storing a coordinate already implies the user accepted that it is as visible
-- as the post itself. Do NOT add a column-scoped or stricter policy here; doing so
-- would diverge from the inherited posts RLS without changing the threat model.
-- ============================================================================

-- NOTE: get_feed_posts (0003_functions.sql) is intentionally NOT modified.
-- v1 does NOT surface location in the feed — coordinates are shown only on the
-- profile map — so the feed RPC's return shape stays untouched.
