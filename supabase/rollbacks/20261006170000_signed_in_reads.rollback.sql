-- Undo 20261006170000_signed_in_reads: signed-out callers may run get_feed_posts and get_follow_data again.
grant execute on function
  public.get_feed_posts(integer, timestamptz, uuid),
  public.get_follow_data(uuid, uuid)
to anon;

notify pgrst, 'reload schema';
