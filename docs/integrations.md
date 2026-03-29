# Integrations

## expo-splash-screen

**Status: Active**

Controls the native OS splash screen.

- Config plugin in `app.config.js` writes adaptive splash colors to native at prebuild time
- Light background: `#F5F5F0`, dark background: `#0F0F0D`
- `SplashScreen.preventAutoHideAsync()` — called at module scope in `App.tsx`
- `SplashScreen.hideAsync()` — called from `onLayout` in `SplashScreen.tsx`

Splash image (`assets/splash-icon.png`) is the default Expo placeholder. Replace with the final MAHI logo (white text, transparent PNG) before a native prebuild.

---

## Supabase — `src/lib/supabase.ts`

**Status: Active**

Primary backend — auth, database, storage, Edge Functions.

- Singleton client created with `createClient()`
- Session persisted via `AsyncStorage` (`autoRefreshToken: true`, `persistSession: true`)
- `detectSessionInUrl: false` — disabled for native

**Required env vars:**
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

**To regenerate DB types** after schema changes:
```bash
npx supabase gen types typescript --project-id <project-id> > src/types/database.ts
```

### Database Tables

| Table | Key Columns | Notes |
|---|---|---|
| `public.profiles` | `id`, `username`, `display_name`, `avatar_url`, `streak_current`, `streak_highest`, `streak_lowest`, `streak_last_upload_date` | SELECT open to all authenticated users (feed joins require it) |
| `public.posts` | `id`, `user_id`, `image_url`, `caption`, `streak_day`, `created_at` | Paginated cursor sort: `created_at DESC, id DESC` |
| `public.conversations` | `id`, `participant_one`, `participant_two`, `status`, `initiated_by`, `updated_at` | `ordered_participants` unique constraint: `participant_one < participant_two` |
| `public.messages` | `id`, `conversation_id`, `sender_id`, `content`, `created_at` | Trigger updates `conversations.updated_at` on insert |
| `public.streak_logs` | `id`, `user_id`, `streak_count`, `started_at`, `ended_at`, `is_active`, `created_at` | Audit log managed by `record_upload_streak` RPC — tracks active and closed streaks |

### Database Functions

**`record_upload_streak(p_user_id uuid, p_upload_date date)`** — `SECURITY DEFINER`
- Authoritative streak counter. Auth-guarded: rejects calls where `p_user_id <> auth.uid()`.
- Uses `SELECT ... FOR UPDATE` row lock to prevent double-tap race conditions.
- Idempotent: same-day calls return current values without incrementing.
- Extends streak if upload is consecutive or on a rest day; resets to 1 if a required day was missed.
- Manages `streak_logs` (opens new log on reset, updates count on extend).
- Returns `{ streak_current, streak_highest, streak_lowest, action }`.
- Always pass `p_upload_date` as the device's **local** date (`new Date().toLocaleDateString('en-CA')`) — do not rely on server `CURRENT_DATE` (UTC) to avoid timezone drift.

### Storage

**Bucket: `posts`** (public — images served via CDN)

- Upload path: `{userId}/{timestamp}_{rand}.jpg`
- Upload: `supabase.storage.from('posts').upload(path, buffer, { contentType: 'image/jpeg' })`
- Public URL: `supabase.storage.from('posts').getPublicUrl(path)` — works correctly because bucket is public
- Storage policies: users can insert/delete their own files; SELECT is open (public reads)
- On upload failure after storage succeeds: call `supabase.storage.from('posts').remove([path])` to avoid orphaned objects

### Edge Functions

All Edge Functions are deployed with `verify_jwt: false` (pre-auth flows).

| Function | Purpose |
|---|---|
| `send-otp` | Receives `{ email, code }`, sends OTP email via Resend |
| `complete-signup` | Creates Supabase auth user via admin API (`email_confirm: true`) |

---

## PostHog — `src/lib/posthog.ts`

**Status: Placeholder (not active)**

Product analytics. Currently `null`.

**To activate:**
1. Add `EXPO_PUBLIC_POSTHOG_API_KEY` to `.env`
2. Uncomment implementation in `src/lib/posthog.ts`
3. Wrap root component with `PostHogProvider` in `App.tsx`

**Required env vars:**
```
EXPO_PUBLIC_POSTHOG_API_KEY
EXPO_PUBLIC_POSTHOG_HOST   # default: https://us.i.posthog.com
```

---

## Sentry — `src/lib/sentry.ts`

**Status: Placeholder (not active, no DSN yet)**

Error and crash reporting. `initSentry()` is currently a no-op. `Sentry.setUser()` calls in `App.tsx` are no-ops until activated.

**To activate:**
1. Create a project at sentry.io, copy the DSN
2. Add `EXPO_PUBLIC_SENTRY_DSN` to `.env`
3. Uncomment implementation in `src/lib/sentry.ts`
4. Call `initSentry()` at the top of `App.tsx`

**Required env vars:**
```
EXPO_PUBLIC_SENTRY_DSN
EXPO_PUBLIC_APP_ENV   # 'development' | 'production' — Sentry only active in production
```
