-- Forced-update gate (tag-loop plan, Phase 3, expand step).
-- Apps below min_app_version show "Update Mahi" and stop. Raise it only after the build that
-- posts through create_post is live in the stores; then the old posting path can be revoked
-- (supabase/deferred/contract_posting.sql).
-- Test: supabase/tests/app_version_gate_test.sql

alter table public.app_config
  add column min_app_version text not null default '0.0.0'
    check (min_app_version ~ '^\d+\.\d+\.\d+$');
