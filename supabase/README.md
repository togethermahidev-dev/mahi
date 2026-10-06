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

Every later migration, through `20261002130000_comment_likes`, has been pushed by the owner and is
live (checked against prod 2026-10-02: video posts and comment likes went in that morning).
**Not pushed yet:** `20261002150000_identity_verifications` (identity checks with Didit: the
`identity_verifications` table — people read only their own rows — and `record_identity_verification`,
service role only; test `tests/identity_verifications_test.sql`, undo
`rollbacks/20261002150000_identity_verifications.rollback.sql`). Additive — nothing reads it unless the
`identity-verification` flag is on. Push it before deploying `didit-session` / `didit-webhook`.
Also not pushed: `20261002170000_mahi_points` (Mahi points replace the old points: no tagger point,
no daily cap, the `point_events` ledger, `award_point`, `app_config.daily_point_cap` and
`stats.points_daily` dropped; `points` in the profile, feed items and the tag list now carries
`streak_current`; the missed-tag push says "points"; test `tests/mahi_points_test.sql`, undo
`rollbacks/20261002170000_mahi_points.rollback.sql`). Safe for every app already on phones: they read
`points` and `streak_current`, and both still exist (`point_events` was empty on prod, checked
2026-10-02).
Also not pushed: `20261002190000_tag_and_feed_pushes` (push wording and feed-lock pushes: the tag
push says "You've just been tagged by @sam. 48 hours left to post your Mahi!", the reminders "24
hours left to post your Mahi! @sam is waiting."; two new pushes, "Your feed locks in 1 hour…" and
"Your feed is locked…", queued only for someone whose feed is open and who holds an open tag, each
with its own switch — `app_config.feed_lock_warning_push`, `feed_lock_warning_lead`,
`feed_locked_push`; reminders and feed pushes are queued by the `queue_tag_pushes` trigger on
`tag_challenges`, no longer by `create_post` / `claim_invite`; `claim_push_batch` closes a push more
than `app_config.push_stale_after` (1 hour) overdue as `stale` instead of sending it; test
`tests/tag_feed_pushes_test.sql`, undo `rollbacks/20261002190000_tag_and_feed_pushes.rollback.sql`).
Safe for every app on phones: nothing the app reads changes. It goes out with the push go-live steps
in `docs/go-live-runbook.md`.
Also not pushed (2026-10-06, after `20261003120000_tag_slots`): `20261006100000_moderation`
(reports on people, posts, comments and messages with a status; staff list and actions with an
audit log; hidden posts and removed comments left out of feeds; the automatic check's queue),
`20261006110000_follow_back` (`get_follow_data` adds `follows_you`) and
`20261006120000_push_deadline_wording` (pushes say the deadline as a day and time, filled in when
sent; the last-call reminder kept for early-morning deadlines). Contract and owner steps:
[docs/moderation.md](../docs/moderation.md). Tests `tests/moderation_test.sql`,
`tests/follow_back_test.sql`, `tests/push_deadline_wording_test.sql`.
Still held back: `deferred/contract_posting.sql`,
`deferred/contract_messages.sql`, `deferred/private_bucket.sql` — they shut old paths and wait for a
store build covered by the version gate — and `deferred/contract_points.sql`, which drops the
profile's `points` column once every phone has the Mahi points update.

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
| `complete-signup` | Creates the confirmed auth user only for a sign-up code `verify-otp` accepted in the last 30 minutes. |
| `send-push` | Push outbox sender, called by pg_cron every minute once the Vault secrets `send_push_url` and `send_push_secret` exist. **Not deployed yet** — the owner's steps are in `docs/go-live-runbook.md` ("Switching push notifications on"). Deploy with `--no-verify-jwt`; the gate is the `X-Internal-Secret` header (`SEND_PUSH_SECRET`). |
| `send-reset-code` | Password reset: same as `send-otp` but stores the code with `purpose = 'reset'`. Answers and works the same whether or not the email has an account. |
| `reset-password` | Checks a reset code (5 tries), then sets the new password with the admin API. Same password rule as sign-up. |
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
refuses email sign-ups without a fresh `verified_at`, which closes the public sign-up endpoint. It is
switched on in the Dashboard (Authentication → Hooks), not by the migration.

Required function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (`send-push` adds `SEND_PUSH_SECRET`).
All functions except `delete-account` and `didit-session` run `verify_jwt: false` (deploy with
`--no-verify-jwt`); those two keep JWT verification on. `didit-webhook` is reached by Didit at
`https://pzepodsppqtvptzmwxzs.supabase.co/functions/v1/didit-webhook` once deployed. Deployed versions (checked against prod 2026-10-01): `send-otp` v18, `verify-otp` v2,
`complete-signup` v7, `send-reset-code` v1, `reset-password` v1, `delete-account` v1. `check-email` is live but
not in this repo. Deploys are the owner's; the CLI needs `SUPABASE_ACCESS_TOKEN` set to a Mahi token.
