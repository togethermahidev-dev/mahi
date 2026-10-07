-- From the 2026-10-07 audit (checked against prod). Additive and safe for every app on phones.

-- 1. Live updates. The app already listens for follow, like and comment changes; these tables were
--    never published, so Friends/Followers lists and like/comment counts only changed on reload.
alter publication supabase_realtime add table public.follows, public.post_likes, public.post_comments;

-- 2. Tags: signed-in only, and only on a post the reader can see (posts' own rules hide a hidden
--    post from everyone but staff). The app reads tags through the feed functions, which run as
--    the database owner, so nothing in the app changes.
drop policy if exists post_tags_select on public.post_tags;
create policy post_tags_select on public.post_tags
  for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_tags.post_id
      and (p.hidden_at is null or public.is_staff())
  ));
revoke all on public.post_tags from anon;

-- 3. A fixed search path on the functions that had none.
alter function public.notify_on_like() set search_path = public;
alter function public.notify_on_comment() set search_path = public;
alter function public.notify_on_follow() set search_path = public;
alter function public.notify_on_tag() set search_path = public;
alter function public.handle_new_block() set search_path = public;
alter function public.handle_unblock() set search_path = public;
alter function public.format_wait(interval) set search_path = public;
alter function public.format_time_left(interval) set search_path = public;
alter function public.format_duration(interval) set search_path = public;
alter function public.get_feed_posts(integer, timestamp with time zone, uuid) set search_path = public;
alter function public.get_follow_data(uuid, uuid) set search_path = public;
alter function public.protect_moderation_columns() set search_path = public;

-- 4. Trigger functions are not API calls. Triggers still fire: Postgres checks this right only
--    when a trigger is created.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- 5. Indexes for every foreign key that had none.
create index if not exists conversation_reads_user_id_idx on public.conversation_reads (user_id);
create index if not exists conversations_initiated_by_idx on public.conversations (initiated_by);
create index if not exists invites_claimed_by_idx on public.invites (claimed_by);
create index if not exists messages_removed_by_idx on public.messages (removed_by);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists moderation_actions_report_id_idx on public.moderation_actions (report_id);
create index if not exists moderation_actions_staff_id_idx on public.moderation_actions (staff_id);
create index if not exists moderation_scans_user_id_idx on public.moderation_scans (user_id);
create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists notifications_challenge_id_idx on public.notifications (challenge_id);
create index if not exists notifications_comment_id_idx on public.notifications (comment_id);
create index if not exists notifications_post_id_idx on public.notifications (post_id);
create index if not exists post_comments_post_id_idx on public.post_comments (post_id);
create index if not exists post_comments_removed_by_idx on public.post_comments (removed_by);
create index if not exists post_comments_user_id_idx on public.post_comments (user_id);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);
create index if not exists posts_hidden_by_idx on public.posts (hidden_by);
create index if not exists push_outbox_user_id_idx on public.push_outbox (user_id);
create index if not exists tag_challenges_post_id_idx on public.tag_challenges (post_id);
create index if not exists user_reports_reported_comment_id_idx on public.user_reports (reported_comment_id);
create index if not exists user_reports_reported_message_id_idx on public.user_reports (reported_message_id);
create index if not exists user_reports_reported_post_id_idx on public.user_reports (reported_post_id);
create index if not exists user_reports_reported_user_id_idx on public.user_reports (reported_user_id);
create index if not exists user_reports_reviewed_by_idx on public.user_reports (reviewed_by);
create index if not exists user_sanctions_created_by_idx on public.user_sanctions (created_by);
create index if not exists user_sanctions_lifted_by_idx on public.user_sanctions (lifted_by);
create index if not exists user_sanctions_report_id_idx on public.user_sanctions (report_id);

notify pgrst, 'reload schema';
