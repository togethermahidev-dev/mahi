-- NOT A MIGRATION YET (tag-loop plan, Phase 6, contract step).
-- Removes the old messaging path so nothing can send around send_message's rules.
--
-- When to use: after the app build that sends through send_message is live in both stores and
-- app_config.min_app_version has been raised to that build's version.
-- How: `supabase migration new contract_messages`, paste this in, write its rollback (recreate the
-- policy and the grant as they are live today), dry-run with scripts/db.sh try, back up, push.

-- Direct inserts into messages (old app builds) stop working.
drop policy if exists messages_insert on public.messages;
revoke insert on public.messages from authenticated;

notify pgrst, 'reload schema';
