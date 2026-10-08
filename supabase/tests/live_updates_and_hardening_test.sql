begin;
select plan(9);

-- Live updates: the app listens to follows, likes and comments.
select ok(exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'follows'),
  'follows sends live updates');
select ok(exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_likes'),
  'likes send live updates');
select ok(exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_comments'),
  'comments send live updates');

-- Tags: signed-in only, never on a hidden post (staff only).
select ok(not has_table_privilege('anon', 'public.post_tags', 'select'),
  'signed-out callers cannot read tags');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000aa01a', 'harden-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000aa01b', 'harden-b@example.invalid');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000aa01a', 'harden_a'),
  ('00000000-0000-0000-0000-0000000aa01b', 'harden_b');
insert into public.posts (id, user_id, image_url, image_path, streak_day, hidden_at) values
  ('00000000-0000-0000-0000-0000000aa0f1', '00000000-0000-0000-0000-0000000aa01a', 'x/1.jpg', 'x/1.jpg', 1, now()),
  ('00000000-0000-0000-0000-0000000aa0f2', '00000000-0000-0000-0000-0000000aa01a', 'x/2.jpg', 'x/2.jpg', 1, null);
insert into public.post_tags (post_id, user_id) values
  ('00000000-0000-0000-0000-0000000aa0f1', '00000000-0000-0000-0000-0000000aa01b'),
  ('00000000-0000-0000-0000-0000000aa0f2', '00000000-0000-0000-0000-0000000aa01b');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- b may see a's posts (posts follow the feed rule since 20261008100000_security_hardening).
-- (Triggers off for this follow, so it leaves no notification behind for the follow test below.)
update public.app_config set feed_lock_enabled = false;
set local session_replication_role = replica;
insert into public.follows (follower_id, following_id)
values ('00000000-0000-0000-0000-0000000aa01b', '00000000-0000-0000-0000-0000000aa01a');
set local session_replication_role = origin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000aa01b');
select is((select count(*)::int from public.post_tags
           where user_id = '00000000-0000-0000-0000-0000000aa01b'), 1,
  'someone else sees the tags on a visible post only');
reset role;
set local session_replication_role = replica;
delete from public.follows
where follower_id = '00000000-0000-0000-0000-0000000aa01b' and following_id = '00000000-0000-0000-0000-0000000aa01a';
set local session_replication_role = origin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000aa01a');
select is((select count(*)::int from public.post_tags
           where user_id = '00000000-0000-0000-0000-0000000aa01b'), 1,
  'the owner does not see tags on their hidden post either, like the post itself');
reset role;

-- Server functions: a fixed search path, and triggers not callable through the API.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
             and p.oid not in (select objid from pg_depend where deptype = 'e')), 0,
  'every public function has a fixed search path');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
             and (has_function_privilege('anon', p.oid, 'execute')
                  or has_function_privilege('authenticated', p.oid, 'execute'))), 0,
  'trigger functions cannot be called through the API');

-- Triggers still fire after the revoke: a follow still makes a notification.
select pg_temp.as_user('00000000-0000-0000-0000-0000000aa01b');
select * from public.set_following('00000000-0000-0000-0000-0000000aa01a', true);
reset role;
select is((select count(*)::int from public.notifications
           where user_id = '00000000-0000-0000-0000-0000000aa01a'
             and actor_id = '00000000-0000-0000-0000-0000000aa01b' and type = 'follow'), 1,
  'a follow still notifies');

select * from finish();
rollback;
