-- Undo 20260928130000_contract_invites: having fewer than three friends excuses the difference again.
begin;
update public.app_config set invite_links_enabled = false;
commit;
