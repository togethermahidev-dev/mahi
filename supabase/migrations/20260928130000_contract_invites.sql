-- Tag-loop plan, Phase 7, contract step (decision #8), from supabase/deferred/contract_invites.sql.
-- Every post fills all three tag slots, with invite links where friends run out (founder,
-- 2026-09-28). Safe now: no store release exists, and preview phones get the app that knows
-- this rule by OTA 10.12 before this is pushed.
-- Test: supabase/tests/invites_test.sql (section 6)

update public.app_config set invite_links_enabled = true;
