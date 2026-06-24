# supabase/

Version-controlled backend for Mahi: schema, RLS, RPCs, triggers, storage, realtime, and Edge Functions.

## Migrations (`migrations/`)

| File | Contents |
|---|---|
| `0001_schema.sql` | All tables + inline constraints/indexes (incl. `user_blocks`, `user_reports`, `otp_codes`, `profiles.is_banned`) |
| `0002_rls.sql` | Row-Level Security enable + policies for every table (RLS is the only authorization layer) |
| `0003_functions.sql` | RPCs (`toggle_like`, `get_feed_posts`, `record_upload_streak`, `get_follow_data`) + triggers (message→conversation `updated_at`, block cascade) |
| `0004_storage_realtime.sql` | `posts` public bucket + storage policies + realtime publication / replica identity |

## ⚠ Reconciliation before pushing to the live project

These migrations were **reconstructed** from `src/types/database.ts` + `docs/integrations.md` (the live DB's schema is authoritative but the `sbp_` token was revoked, so it could not be pulled). They are a correct, version-controlled **baseline** — but before applying to the live project:

1. Mint a fresh Personal Access Token → https://supabase.com/dashboard/account/tokens, put it in `.mcp.json` (`SUPABASE_ACCESS_TOKEN`) and `supabase login`.
2. `supabase link --project-ref pzepodsppqtvptzmwxzs`
3. **`supabase db pull`** to capture the *actual* live schema, then diff it against these files and reconcile any drift (the live DB wins).
4. Or, to seed a fresh DB / verify locally: install Docker (e.g. `brew install colima docker && colima start`), then `supabase start` and `supabase db reset` to apply + test these migrations.

Known reconstruction fixes already applied during review: `toggle_like` uses delete-then-insert (not the invalid `ON CONFLICT DO DELETE`); `messages.conversation_id` has `ON DELETE CASCADE` and `conversations` has a participant `DELETE` policy (needed by the deny-request flow).

## Edge Functions (`functions/`)

| Function | Purpose |
|---|---|
| `send-otp` | Generates a code **server-side**, stores `sha256(code)` + expiry in `otp_codes`, emails via Resend. Never returns the code. |
| `complete-signup` | Verifies the code server-side (hash, expiry, attempts) **before** creating the auth user, then deletes the OTP row. Closes the email-verification bypass. |

Required function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`. Deploy with `supabase functions deploy` (all functions run `verify_jwt: false` — they are pre-auth flows).
