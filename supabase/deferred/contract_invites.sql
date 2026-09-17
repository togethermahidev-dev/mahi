-- NOT A MIGRATION YET (tag-loop plan, Phase 7, contract step; decision #8).
-- Switches on the rule that every post fills all three tag slots, with invites where friends
-- run out. Until this runs, having fewer than three friends still excuses the difference.
--
-- When to use: after the app build that can send invites is live in both stores and
-- app_config.min_app_version has been raised to that build's version. Before then it would
-- refuse posts from any older build whose user has fewer than three friends.
-- How: `supabase migration new contract_invites`, paste this in, write its rollback
-- (`update public.app_config set invite_links_enabled = false;`), dry-run with scripts/db.sh try,
-- back up, push.

update public.app_config set invite_links_enabled = true;
