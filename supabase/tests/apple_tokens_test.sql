-- Apple tokens: the apple-token function keeps each Apple account's refresh token so the
-- delete-account function can revoke it with Apple. Only the server (service role) can touch it,
-- and deleting the account removes it.
begin;
select plan(9);

select has_table('public', 'apple_tokens', 'the table exists');
select col_is_pk('public', 'apple_tokens', 'user_id', 'one row per account');
select col_not_null('public', 'apple_tokens', 'refresh_token', 'a row always has a token');
select ok((select relrowsecurity from pg_class where oid = 'public.apple_tokens'::regclass),
  'row security is on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'apple_tokens'),
  0, 'no policies: the app can never read or write a row');
select ok(not has_table_privilege('anon', 'public.apple_tokens', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.apple_tokens', 'select,insert,update,delete'),
  'signed-out and signed-in app users have no rights on the table');
select ok(has_table_privilege('service_role', 'public.apple_tokens', 'select,insert,update,delete'),
  'the server functions can read and write it');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a9e10', 'apple-a@example.invalid');
insert into public.apple_tokens (user_id, refresh_token)
values ('00000000-0000-0000-0000-0000000a9e10', 'r-test');
select isnt((select updated_at from public.apple_tokens
             where user_id = '00000000-0000-0000-0000-0000000a9e10'), null,
  'updated_at is stamped');

delete from auth.users where id = '00000000-0000-0000-0000-0000000a9e10';
select is((select count(*)::int from public.apple_tokens
           where user_id = '00000000-0000-0000-0000-0000000a9e10'),
  0, 'deleting the account removes its Apple token');

select * from finish();
rollback;
