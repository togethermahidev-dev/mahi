-- The live database only: it needs Vault and pg_net, which the local stand-ins don't have, so it
-- is not part of `scripts/db.sh local`. Run it through `scripts/db.sh try`, after the migration
-- (20261013100000_account_deletion_reasons). Everything here stays inside a transaction that is
-- rolled back: the made-up Slack address, the account and the queued message never leave it, so
-- nothing is ever sent.
-- With a Slack address set, deleting an account queues one message to it, built from the kept
-- row alone.
begin;
select plan(4);

-- A made-up Slack address, unless the real one is already set (names are unique in Vault).
select vault.create_secret('https://hooks.slack.com/services/T000/B000/test',
                           'account_deletions_slack_url')
where not exists (select 1 from vault.secrets where name = 'account_deletions_slack_url');

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000de1f01', 'del-slack@example.invalid');
insert into public.profiles (id, username, timezone)
values ('00000000-0000-0000-0000-000000de1f01', 'delslack_a', 'Europe/London');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
         json_build_object('sub', '00000000-0000-0000-0000-000000de1f01', 'role', 'authenticated')::text,
         true);
select public.set_account_deletion_reason('other', 'Too many <!here> pings');
reset role;

create temp table queued_before as select coalesce(max(id), 0) as id from net.http_request_queue;
select lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-000000de1f01'$$,
  'the account can be deleted with a Slack address set');

create temp table queued as
  select q.url, convert_from(q.body, 'utf8')::jsonb ->> 'text' as text
  from net.http_request_queue q where q.id > (select id from queued_before);

select is((select count(*)::int from queued where url like 'https://hooks.slack.com/%'), 1,
  'one message is queued for Slack');
select is(
  (select text from queued),
  E'Someone deleted their Mahi account.\n• Why: Something else\n• In their words: “Too many &lt;!here&gt; pings”\n• Had the account: less than a day\n• Posted a workout: no',
  'it says why, in their words, and cannot ping anyone');
select ok((select text !~* 'delslack|del-slack|de1f01' from queued),
  'and it does not say who');

select * from finish();
rollback;
