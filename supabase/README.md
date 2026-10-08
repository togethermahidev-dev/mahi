# supabase/

Version-controlled backend for Mahi: schema, RLS, RPCs, triggers, storage, realtime, and Edge Functions.
Production project: `pzepodsppqtvptzmwxzs` (free plan, eu-west-2). There is no separate test database;
see decision #13 in [docs/decisions.md](../docs/decisions.md).

## Migrations (`migrations/`)

The files are production's own migration history, downloaded from
`supabase_migrations.schema_migrations` on 2026-09-17 (31 files, `20260224124711` to
`20260625080354`), plus `20260917105120_reconcile_drift.sql`, which records the `avatars` bucket and
policies that had been created in the dashboard. Every live table, column, function, trigger, policy,
index and bucket was checked against these files; nothing else was missing.

Every later migration through `20261008150000_security_hardening_live` is live on production
(checked against prod 2026-10-08, backup `20261008093204`).
**Pushed 2026-10-08:** `20261008140000_first_workout_no_tags` — the first workout needs no tags,
whether or not it answers a tag (`create_post`: `when v_first_post then 0`); later posts still need
a live tag and 3 friends. Test `tests/first_workout_no_tags_test.sql`.
**Pushed 2026-10-08 (live Supabase check):** `20261008150000_security_hardening_live` —
follows change only through `set_following` (direct insert/delete rules and grants gone;
`notify_on_follow` skips blocked pairs and banned followers); `profiles.avatar_url` must be this
project's public avatars address in the person's own folder; avatar files listable only by their
owner (bucket stays public); `get_message_reactions` / `react_to_message` signed-in only; anon has
no table rights in `public` and authenticated no truncate/references/trigger (also for new
tables); reports only through `report_*` (direct insert rule and grant gone); `answered_by_post` /
`post_invites` internal. Phones on an app older than OTA 12.20 follow by writing the table, so
their Follow button stopped working when this went live (no store users before launch). Test
`tests/security_hardening_live_test.sql`, undo `rollbacks/20261008150000_security_hardening_live.rollback.sql`.
**Pushed 2026-10-08 (security review):** `20261008100000_security_hardening` — posts
and their photos follow the feed rule (own, staff, or `can_view_post`), the `posts` bucket is
private, likes/comments/`toggle_like` only on posts you can see, `get_feed_posts` revoked, no
direct writes to `posts` / `post_tags`, no tag notification across a block or from a banned
person, profile inserts limited to the sign-up columns, email sign-ups need complete-signup's
`app_metadata.signup_via` marker, `revoke_user_sessions` (server only), `message_reactions_json`
internal, `get_suggested_follows` answers for `auth.uid()`. Then
`20261008110000_staff_confirmed_email` — staff rows of unconfirmed accounts removed and
`staff_role` / `is_staff` require a confirmed email; `20261008120000_comment_like_visibility` and
`20261008130000_security_followups` (sign-up stamp, report copies staff-only, comment-like lists
follow the post). Deploy `complete-signup` before the push and `reset-password` / `check-email`
after it. Tests `tests/security_hardening_test.sql`, `tests/staff_confirmed_email_test.sql`,
`tests/comment_like_visibility_test.sql`, `tests/security_followups_test.sql`; undo in `rollbacks/`.
`posthog_reader` (from `20261007160000_founder_stats`) is created no-login; on production it has
LOGIN (checked 2026-10-08).
**Pushed 2026-10-08:** `20261008160000_drop_dead_functions` — drops `get_feed_posts`
(revoked from everyone by `20261008100000`; the app reads `get_feed`) and `format_wait` (pushes use
`format_duration`); nothing calls either. Test `tests/drop_dead_functions_test.sql` (also updated:
`tests/signed_in_reads_test.sql`, `tests/security_hardening_test.sql`), undo
`rollbacks/20261008160000_drop_dead_functions.rollback.sql`.
**Pushed 2026-10-08 (backup `20261008111227`, checked against prod):** `20261008170000_private_accounts` — public and private accounts
and Controls (decisions #119–#124): `profiles.is_private` / `posts_visibility` / `tag_permission` /
`privacy_chosen_at` (existing profiles stamped, stay public; workouts start at `followers` for
existing and new profiles, so nobody is opened up; changed only through
`set_account_controls`); `follow_requests` (+ internal `follow_request_notices`); `set_following`
answers `status` and `is_private` (drop + create); new `respond_follow_request`, `remove_follower`,
`get_follow_requests`, `set_account_controls`; `get_follow_data` answers only for the caller and adds
`requested` / `is_private`; `can_view_post` follows the workouts setting (feed lock on top), so
posts, files, likes, comments and comment likes follow; `get_feed` / `get_user_posts` (`restricted`);
follow lists closed by the owner's setting (`follows_select`, `can_see_follow_lists`, `get_friends`);
`create_post` / `invite_to_tag` / `search_tag_people` / `match_contacts` (`tag_mode`);
`get_suggested_follows` adds `is_private` / `requested` (drop + create), skips banned people and
counts only follows the caller may see; `follow_requests` keyed by a random id; accepting a
tag request no longer makes follows; `claim_invite` general invite from a private account = request;
`follow_request` / `follow_accepted` notices and pushes (`notifications.follow_request` marks an
`invite_joined` whose claimer's follow is a request; the app may update only `is_read` on
notifications); someone tagged on a post, and the tagger of the tag a post answers, always see that
post (`tag_shows_post`, `can_view_post_for`; blocks, bans and the feed lock still win); blocks and
bans clear requests. Tests
`tests/private_accounts_test.sql`, `tests/controls_test.sql`, `tests/tagged_post_visibility_test.sql` (also updated:
`tests/comment_like_visibility_test.sql`, `tests/feed_lock_test.sql`, `tests/follow_back_test.sql`,
`tests/mutual_follow_wording_test.sql`, `tests/push_deadline_wording_test.sql`,
`tests/security_followups_test.sql`, `tests/security_hardening_test.sql`,
`tests/tag_challenges_test.sql`, `tests/tag_feed_pushes_test.sql`, `tests/tag_slots_test.sql`), undo
`rollbacks/20261008170000_private_accounts.rollback.sql`. Phones without the app update read
`requested` as not following until the OTA.
Still held back: `deferred/contract_points.sql`, which drops the profile's `points` column once
every phone has the Mahi points update. (`contract_messages` is live as migration
`20261007111029_contract_messages`; `contract_posting` and `private_bucket` became
`20261008100000_security_hardening`.)

Latest production migration: `20261008170000_private_accounts` (live 2026-10-08), the
doors the live Supabase check found open: follows change only through `set_following`, reports only
through `report_*`, avatar addresses and files limited to the person's own folder, no table rights
for signed-out callers (details above). Its header names the undo file
`rollbacks/20261008140000_security_hardening_live.rollback.sql`; the file is
`rollbacks/20261008150000_security_hardening_live.rollback.sql`. The migration is applied, so its
header stays as it is.

Rules (enforced by `.claude/hooks/guard.cjs`):

- Create migrations with `supabase migration new <name>` (14-digit timestamp prefix, newest last).
  Never edit a migration once it has been pushed; add a new one.
- Each migration has an undo script in `rollbacks/<same name>.rollback.sql` and a pgTAP test in
  `tests/`.
- Production changes only through `scripts/db.sh` (no Docker needed; the free plan has no automatic
  backups):
  - `scripts/db.sh backup` — schema + data dump into `backups/` (gitignored — it holds user data).
    The guard refuses a push without a backup under 60 minutes old.
  - `scripts/db.sh local` — first check, no password needed: replays every migration on a
    throwaway local Postgres 17 (Supabase stand-ins in `tests/local/stubs.sql`; needs
    `brew install postgresql@17` and pgTAP built against it) and runs all tests.
  - `scripts/db.sh try <migration.sql> <test.sql>` — dry run: applies the migration and runs its
    test in one transaction on production, then rolls everything back. Do this before every push.
  - `scripts/db.sh push --dry-run`, then `scripts/db.sh push`.
  - `scripts/db.sh test` — runs `tests/*.sql` with `psql`; every file is `begin; … rollback;`.
- The script reads the database password from `~/.pgpass` (the owner adds it; never committed):
  `aws-1-eu-west-2.pooler.supabase.com:5432:postgres:postgres.pzepodsppqtvptzmwxzs:<password>`

The build plan is [docs/tag-loop-plan.md](../docs/tag-loop-plan.md).

## Edge Functions (`functions/`)

| Function | Purpose |
|---|---|
| `send-otp` | Makes a 6-digit sign-up code (`purpose = 'signup'`) **server-side**, stores `sha256(code)` + expiry in `otp_codes`, emails it via Resend from `noreply@mahitechnology.com`. Limits: 1/min and 5/hour per email, 5/min and 30/hour per network address (`auth_rate_limits`). |
| `verify-otp` | Checks a typed sign-up code (5 tries, one atomic update per try) and stamps `verified_at` on a match. |
| `complete-signup` | Creates the confirmed auth user only for a sign-up code `verify-otp` accepted in the last 30 minutes; its tries count against the code's same 5 (`tryVerifiedCode`). The user carries `app_metadata.signup_via = 'complete-signup'`, which the sign-up hook requires. |
| `check-email` | Sign-up form hint: `{ exists }` for an email, from `auth_user_id_by_email`. Never blocks sign-up. Deploy with `--no-verify-jwt`. |
| `send-push` | Push outbox sender, called by pg_cron every minute once the Vault secrets `send_push_url` and `send_push_secret` exist. **Not deployed yet** — the owner's steps are in `docs/go-live-runbook.md` ("Switching push notifications on"). Deploy with `--no-verify-jwt`; the gate is the `X-Internal-Secret` header (`SEND_PUSH_SECRET`). |
| `send-reset-code` | Password reset: same as `send-otp` but stores the code with `purpose = 'reset'`. Answers and works the same whether or not the email has an account. |
| `reset-password` | Checks a reset code (5 tries), then sets the new password with the admin API and signs every session out (`revoke_user_sessions`). Same password rule as sign-up. |
| `delete-account` | Deletes the caller's photos (`posts/{id}/`, `avatars/{id}/`), then their auth user; every table cascades. Deployed **with** JWT verification. |
| `didit-session` | Identity check, step 1: for the signed-in caller (token checked), creates a Didit session (`POST https://verification.didit.me/v3/session/`, `vendor_data` = user id), stores a `pending` row and returns the session token. Already approved → no new session; at most 5 a day. **Not deployed.** Deploy **with** JWT verification. Secrets `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`. |
| `didit-webhook` | Identity check, step 2: Didit calls it on each status change. Checks the HMAC signature (`X-Signature` or `X-Signature-V2`, `X-Timestamp` within 5 minutes) with `DIDIT_WEBHOOK_SECRET`, then records the status (repeats and late events are harmless; statuses only, no personal details). **Not deployed.** Deploy with `--no-verify-jwt`. |
| `moderate-content` | The automatic check of new posts and comments (docs/moderation.md). Called only by pg_cron (`invoke_moderate_content`, every minute while checks wait) once the Vault secrets `moderate_content_url` and `moderate_content_secret` exist; the gate is the `X-Internal-Secret` header (`MODERATE_CONTENT_SECRET`). Without `OPENAI_API_KEY` it checks nothing and logs it. **Not deployed.** Deploy with `--no-verify-jwt`. |

Didit pieces live in `functions/_shared/didit.ts` (`deno test functions/_shared/didit_test.ts`).
Sign-up and reset codes share `otp_codes`, kept apart by `purpose` (migration
`20261001100000_password_reset_codes`). Shared code lives in `functions/_shared/otp.ts` and
`functions/_shared/email.ts` (`deno test functions/_shared/`). The code email's colours, sizes and
font come from `functions/_shared/emailTokens.ts`, generated from the app's tokens by
`pnpm tokens:email` — never edit it by hand; `pnpm test:scripts` fails when it drifts. The
Before User Created auth hook `hook_require_verified_signup` (migration `20260923230000_signup_codes`)
refuses email sign-ups without a fresh `verified_at` and (from `20261008100000_security_hardening`)
without `app_metadata.signup_via = 'complete-signup'`, which closes the public sign-up endpoint.
(Supabase Auth does not run this hook for admin-API users, so complete-signup never meets it.) It is
switched on in the Dashboard (Authentication → Hooks), not by the migration.

Required function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (`send-push` adds `SEND_PUSH_SECRET`).
All functions except `delete-account` and `didit-session` run `verify_jwt: false` (deploy with
`--no-verify-jwt`); those two keep JWT verification on. `didit-webhook` is reached by Didit at
`https://pzepodsppqtvptzmwxzs.supabase.co/functions/v1/didit-webhook` once deployed. Deployed versions (checked against prod 2026-10-01): `send-otp` v18, `verify-otp` v2,
`complete-signup` v7, `send-reset-code` v1, `reset-password` v1, `delete-account` v1. `check-email` is live (its
source is in `functions/check-email`). Deploys are the owner's; the CLI needs `SUPABASE_ACCESS_TOKEN` set to a Mahi token.
