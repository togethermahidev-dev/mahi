-- Undo 20260923231000_version_gate. Apps from that release then fail open (no gate).
begin;
drop function public.get_app_gate(text);
alter table public.app_config
  drop column gate_enabled,
  drop column min_version_ios,
  drop column min_version_android,
  drop column min_build_ios,
  drop column min_build_android,
  drop column store_url_ios,
  drop column store_url_android,
  drop column gate_message;
commit;
