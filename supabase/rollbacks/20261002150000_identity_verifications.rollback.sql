-- Undo 20261002150000_identity_verifications: drops identity checks (every stored result is
-- lost; Didit keeps its own copy of each session). Switch the `identity-verification` flag off
-- and delete the didit-session and didit-webhook functions first: with them live, new sessions
-- and webhooks would fail.
begin;

drop function public.record_identity_verification(text, uuid, text, text, jsonb, timestamptz);
drop table public.identity_verifications;

delete from supabase_migrations.schema_migrations where version = '20261002150000';

commit;
