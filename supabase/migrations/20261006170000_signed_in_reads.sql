-- Feed and profile reads for signed-in people only (owner, 2026-10-06). get_feed_posts (the older
-- apps' feed) and get_follow_data (follow counts on a profile) could be called signed out. The
-- app calls them only with a signed-in session (checked 2026-10-06: get_follow_data from
-- ui/src/api/follows.ts with the signed-in user's id; get_feed_posts only by older builds' feed,
-- which is behind sign-in), so nothing on phones changes. Every other feed and profile read is
-- already signed-in only (checked against prod 2026-10-06).
-- Test: supabase/tests/signed_in_reads_test.sql
-- Undo: supabase/rollbacks/20261006170000_signed_in_reads.rollback.sql

revoke execute on function
  public.get_feed_posts(integer, timestamptz, uuid),
  public.get_follow_data(uuid, uuid)
from public, anon;

grant execute on function
  public.get_feed_posts(integer, timestamptz, uuid),
  public.get_follow_data(uuid, uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';
