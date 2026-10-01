-- Version gate (pingmee-v2 model): a minimum version and build per platform, a switch that is
-- OFF until the owner turns it on, and a reader that works before sign-in (old builds that are
-- signed out still get gated). Apps from this release read get_app_gate(); older builds keep
-- reading min_app_version, which stays as it is.
-- Raise the numbers only after that version/build is LIVE in that store (Android: 100% rollout).
-- Test: supabase/tests/version_gate_test.sql

alter table public.app_config
  add column gate_enabled boolean not null default false,
  add column min_version_ios text not null default '0.0.0'
    constraint app_config_min_version_ios_semver check (min_version_ios ~ '^\d+\.\d+\.\d+$'),
  add column min_version_android text not null default '0.0.0'
    constraint app_config_min_version_android_semver check (min_version_android ~ '^\d+\.\d+\.\d+$'),
  add column min_build_ios int
    constraint app_config_min_build_ios_positive check (min_build_ios > 0),
  add column min_build_android int
    constraint app_config_min_build_android_positive check (min_build_android > 0),
  add column store_url_ios text,
  add column store_url_android text,
  add column gate_message text;

create function public.get_app_gate(p_platform text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', c.gate_enabled,
    'min_version', case p_platform when 'ios' then c.min_version_ios else c.min_version_android end,
    'min_build', case p_platform when 'ios' then c.min_build_ios else c.min_build_android end,
    'store_url', case p_platform when 'ios' then c.store_url_ios else c.store_url_android end,
    'message', c.gate_message)
  from public.app_config c
  where p_platform in ('ios', 'android');
$$;

revoke execute on function public.get_app_gate(text) from public;
grant execute on function public.get_app_gate(text) to anon, authenticated;
