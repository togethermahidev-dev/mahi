-- The minimum app version is readable by signed-in users and only accepts x.y.z.
begin;
select plan(3);

select is((select min_app_version from public.app_config), '0.0.0', 'defaults to 0.0.0 (no one is blocked)');
select throws_ok($$update public.app_config set min_app_version = 'latest'$$, '23514', null,
  'only x.y.z versions are accepted');

set local role authenticated;
select is((select min_app_version from public.app_config), '0.0.0', 'signed-in apps can read it');

select * from finish();
rollback;
