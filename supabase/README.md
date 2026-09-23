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
| `send-otp` | Makes a 6-digit code **server-side**, stores `sha256(code)` + expiry in `otp_codes`, emails it via Resend from `noreply@mahitechnology.com`. Limits: 1/min and 5/hour per email, 5/min and 30/hour per network address (`auth_rate_limits`). |
| `verify-otp` | Checks a typed code (5 tries, one atomic update per try) and stamps `verified_at` on a match. |
| `complete-signup` | Creates the confirmed auth user only for a code `verify-otp` accepted in the last 30 minutes. |
| `send-push` | Push outbox sender, called by pg_cron. |

Shared code lives in `functions/_shared/otp.ts` (`deno test functions/_shared/otp_test.ts`). The
Before User Created auth hook `hook_require_verified_signup` (migration `20260923230000_signup_codes`)
refuses email sign-ups without a fresh `verified_at`, which closes the public sign-up endpoint. It is
switched on in the Dashboard (Authentication → Hooks), not by the migration.

Required function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`. All functions run
`verify_jwt: false` (pre-auth flows). `check-email` is live but not in this repo.
