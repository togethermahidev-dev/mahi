-- ============================================================================
-- 0001_schema.sql
-- Canonical CREATE TABLE migration for the Mahi Supabase Postgres backend.
-- Inline indexes / unique constraints are kept as authored. The two indexes
-- not already present inline (notifications recency, messages ordering) are
-- appended at the bottom from the indexes draft. RLS for otp_codes lives in
-- 0002_rls.sql, NOT here.
-- ============================================================================

-- 1. profiles (no FK dependencies)
create table public.profiles (
  id uuid primary key default gen_random_uuid() references auth.users(id),
  username text not null unique,
  display_name text,
  first_name text,
  last_name text,
  avatar_url text,
  contact_number text,
  date_of_birth text,
  fitness_routine text,
  fitness_goals text[],
  streak_current integer not null default 0,
  streak_highest integer not null default 0,
  streak_lowest integer,
  streak_last_upload_date text,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. posts (depends on profiles)
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  image_url text not null,
  pov_image_url text,
  caption text,
  streak_day integer not null,
  created_at timestamptz not null default now(),
  constraint posts_user_id_fkey foreign key (user_id) references public.profiles(id),
  constraint posts_user_day_unique unique (user_id, ((created_at at time zone 'UTC')::date))
);

-- 3. post_likes (depends on posts, profiles)
create table public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint post_likes_post_id_fkey foreign key (post_id) references public.posts(id),
  constraint post_likes_user_id_fkey foreign key (user_id) references public.profiles(id),
  constraint post_likes_post_id_user_id_key unique (post_id, user_id)
);

-- 4. post_comments (depends on posts, profiles)
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint post_comments_post_id_fkey foreign key (post_id) references public.posts(id),
  constraint post_comments_user_id_fkey foreign key (user_id) references public.profiles(id)
);

-- 5. post_tags (depends on posts, profiles)
create table public.post_tags (
  post_id uuid not null,
  user_id uuid not null,
  primary key (post_id, user_id),
  constraint post_tags_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade,
  constraint post_tags_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create index post_tags_user_id_idx on public.post_tags(user_id);

-- 6. follows (depends on profiles)
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null,
  following_id uuid not null,
  created_at timestamptz not null default now(),
  constraint follows_follower_id_fkey foreign key (follower_id) references public.profiles(id),
  constraint follows_following_id_fkey foreign key (following_id) references public.profiles(id),
  constraint follows_follower_id_following_id_key unique (follower_id, following_id),
  constraint follows_self_follow_prevention check (follower_id <> following_id)
);

create index idx_follows_follower on public.follows(follower_id);
create index idx_follows_following on public.follows(following_id);

-- 7. conversations (depends on profiles)
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one uuid not null,
  participant_two uuid not null,
  status text not null default 'active',
  initiated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_participant_one_fkey foreign key (participant_one) references public.profiles(id),
  constraint conversations_participant_two_fkey foreign key (participant_two) references public.profiles(id),
  constraint conversations_initiated_by_fkey foreign key (initiated_by) references public.profiles(id),
  constraint ordered_participants check (participant_one < participant_two),
  constraint conversations_participants_unique unique (participant_one, participant_two)
);

create index convos_p1_idx on public.conversations(participant_one, updated_at desc);
create index convos_p2_idx on public.conversations(participant_two, updated_at desc);

-- 8. messages (depends on conversations, profiles)
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  sender_id uuid not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_conversation_id_fkey foreign key (conversation_id) references public.conversations(id) on delete cascade,
  constraint messages_sender_id_fkey foreign key (sender_id) references public.profiles(id)
);

-- 9. streak_logs (depends on profiles)
create table public.streak_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  streak_count integer not null default 1,
  started_at timestamptz not null,
  ended_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint streak_logs_user_id_fkey foreign key (user_id) references public.profiles(id)
);

-- 10. notifications (depends on profiles, posts, post_comments)
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid not null,
  type text not null,
  post_id uuid,
  comment_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_user_id_fkey foreign key (user_id) references public.profiles(id),
  constraint notifications_actor_id_fkey foreign key (actor_id) references public.profiles(id),
  constraint notifications_post_id_fkey foreign key (post_id) references public.posts(id),
  constraint notifications_comment_id_fkey foreign key (comment_id) references public.post_comments(id)
);

-- 11. user_blocks (depends on profiles)
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  constraint user_blocks_blocker_id_fkey foreign key (blocker_id) references public.profiles(id),
  constraint user_blocks_blocked_id_fkey foreign key (blocked_id) references public.profiles(id),
  constraint user_blocks_blocker_id_blocked_id_key unique (blocker_id, blocked_id)
);

-- 12. user_reports (depends on profiles, posts)
create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null,
  reported_user_id uuid,
  reported_post_id uuid,
  reason text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint user_reports_reporter_id_fkey foreign key (reporter_id) references public.profiles(id),
  constraint user_reports_reported_user_id_fkey foreign key (reported_user_id) references public.profiles(id),
  constraint user_reports_reported_post_id_fkey foreign key (reported_post_id) references public.posts(id),
  constraint user_reports_reporter_id_reported_user_id_key unique (reporter_id, reported_user_id)
);

-- 13. otp_codes (standalone; RLS configured in 0002_rls.sql, service_role only)
create table public.otp_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Additional indexes (from the indexes draft) NOT already inlined above.
-- The remaining indexes in that draft duplicate the inline constraints/indexes
-- (posts_user_day_unique, conversations_participants_unique, follows unique,
-- post_likes unique, convos_p1/p2_idx, idx_follows_*, post_tags_user_id_idx)
-- and are intentionally omitted to avoid duplicate-object errors.
-- ============================================================================

-- notifications: fast lookup by user and recency
create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);

-- messages: fast lookup by conversation and creation order
create index messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);
