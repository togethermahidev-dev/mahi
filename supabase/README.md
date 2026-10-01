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

Every later migration, through `20261001100100_account_delete_cascade`, has been pushed by the owner and
is live (checked against prod 2026-10-01). Still held back: `deferred/contract_posting.sql`,
`deferred/contract_messages.sql`, `deferred/private_bucket.sql` — they shut old paths and wait for a
store build covered by the version gate.

Not pushed yet: `20261001120000_reactive_posting` and `supabase/deferred/drop_rest_days.sql`. Release order
(owner-only): push `reactive_posting` → publish the OTA → turn `supabase/deferred/drop_rest_days.sql` into a migration and push it only once every phone
has the new app (old builds still insert `fitness_routine` at sign-up and read the dropped columns).

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
| `send-push` | Push outbox sender, called by pg_cron. **Not deployed yet** — waits for push credentials (see `docs/go-live-runbook.md`). |
| `send-reset-code` | Password reset: same as `send-otp` but stores the code with `purpose = 'reset'`. Answers and works the same whether or not the email has an account. |
| `reset-password` | Checks a reset code (5 tries), then sets the new password with the admin API. Same password rule as sign-up. |
| `delete-account` | Deletes the caller's photos (`posts/{id}/`, `avatars/{id}/`), then their auth user; every table cascades. Deployed **with** JWT verification. |

Sign-up and reset codes share `otp_codes`, kept apart by `purpose` (migration
`20261001100000_password_reset_codes`). Shared code lives in `functions/_shared/otp.ts` and
`functions/_shared/email.ts` (`deno test functions/_shared/`). The
Before User Created auth hook `hook_require_verified_signup` (migration `20260923230000_signup_codes`)
refuses email sign-ups without a fresh `verified_at`, which closes the public sign-up endpoint. It is
switched on in the Dashboard (Authentication → Hooks), not by the migration.

Required function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (`send-push` adds `SEND_PUSH_SECRET`).
All functions except `delete-account` run `verify_jwt: false` (deploy with `--no-verify-jwt`); `delete-account`
keeps JWT verification on. Deployed versions (checked against prod 2026-10-01): `send-otp` v18, `verify-otp` v2,
`complete-signup` v7, `send-reset-code` v1, `reset-password` v1, `delete-account` v1. `check-email` is live but
not in this repo. Deploys are the owner's; the CLI needs `SUPABASE_ACCESS_TOKEN` set to a Mahi token.
