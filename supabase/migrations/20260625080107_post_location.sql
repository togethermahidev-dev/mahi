-- Per-post location (roadmap 4.1). Adds optional latitude/longitude to posts.
-- Both columns are NULLABLE: posts created without location consent stay valid
-- and existing rows backfill as NULL. RLS intentionally unchanged — the new
-- columns are covered by the existing "Posts: SELECT all authenticated" policy,
-- so anyone who can read a post can read its (rounded, opt-in) coordinates.
alter table public.posts
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

comment on column public.posts.latitude is 'Optional WGS84 latitude (decimal degrees) of where the post was created; NULL when location consent was not granted.';
comment on column public.posts.longitude is 'Optional WGS84 longitude (decimal degrees) of where the post was created; NULL when location consent was not granted.';
