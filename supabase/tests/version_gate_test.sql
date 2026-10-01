-- Version gate: per-platform minimum version and build, off by default, readable before sign-in.
begin;
select plan(10);

select is((select gate_enabled from public.app_config), false, 'the gate starts switched off');
select is(public.get_app_gate('ios') ->> 'enabled', 'false', 'the app is told it is off');
select is(public.get_app_gate('ios') ->> 'min_version', '0.0.0', 'iOS minimum defaults to 0.0.0');
select is(public.get_app_gate('android') -> 'min_build', 'null'::jsonb, 'no build minimum by default');

update public.app_config set gate_enabled = true, min_version_ios = '0.2.0', min_build_ios = 12,
  store_url_ios = 'https://apps.apple.com/app/id1', min_version_android = '0.1.0';
select is(public.get_app_gate('ios'),
  jsonb_build_object('enabled', true, 'min_version', '0.2.0', 'min_build', 12,
    'store_url', 'https://apps.apple.com/app/id1', 'message', null),
  'iOS gets its own row of values');
select is(public.get_app_gate('android') ->> 'min_version', '0.1.0', 'Android gets its own minimum');
select is(public.get_app_gate('web'), null, 'an unknown platform gets nothing (the app lets it in)');

select throws_ok($$ update public.app_config set min_version_ios = 'latest' $$, '23514', null,
  'only x.y.z versions are accepted');
select throws_ok($$ update public.app_config set min_build_android = 0 $$, '23514', null,
  'a build minimum is a positive number');

set local role anon;
select is(public.get_app_gate('ios') ->> 'min_version', '0.2.0',
  'a signed-out app can read the gate');

select * from finish();
rollback;
