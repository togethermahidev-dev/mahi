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
| `send-otp` | Generates a code **server-side**, stores `sha256(code)` + expiry in `otp_codes`, emails via Resend. Never returns the code. |
| `complete-signup` | Verifies the code server-side (hash, expiry, attempts) **before** creating the auth user, then deletes the OTP row. Closes the email-verification bypass. |

Required function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`. All functions run
`verify_jwt: false` (pre-auth flows).

⚠ **Not live yet (checked 2026-09-17).** Production runs older versions of `send-otp` (v15, Apr 2026)
and `complete-signup` (v4, Feb 2026), plus a `check-email` function that is not in this repo. The
`otp_codes` table these versions need does not exist in production. Before deploying them: add
`otp_codes` (and its block-all RLS) in a migration, and confirm which app builds call which flow.
