# mahi-fitness — Project Rules for Claude

## Architecture & Adding Features
- 5-layer architecture, strict downward deps: `screens/components → hooks → stores → api → lib → supabase`.
  See the **Layering Contract** in `docs/architecture.md` for the per-layer import rules.
- To add a full-stack feature, follow `docs/adding-a-feature.md` (copy `follows.ts` / `followStore.ts` /
  `useNotifications.ts` as templates). Every new store's `reset()` MUST be wired into the `App.tsx` sign-out branch.
- Never read `process.env.*` directly — import the typed, fail-fast `env` from `src/lib/env.ts`.

## Supabase Edge Functions
- Pre-auth functions (`send-otp`, `verify-otp`, `complete-signup`, `send-reset-code`, `reset-password`)
  and the cron-called `send-push` are deployed with `verify_jwt: false` (`--no-verify-jwt`)
- `delete-account` is the exception: deployed **with** JWT verification (the default); it acts on the caller
- Functions are deployed by the owner only; see `supabase/README.md`

## Email / OTP
- The server makes, stores (SHA-256 hash only) and checks every sign-up code; the app never sees
  the code except as the user types it. Same design as Pingmee.
  - `send-otp` `{ email }` → emails a 6-digit code, 10-minute expiry, send limits per email and per network address
  - `verify-otp` `{ email, code }` → checks it (5 tries), stamps `otp_codes.verified_at`
  - `complete-signup` `{ email, password, code }` → creates the account only for a code verified in the last 30 minutes
  - Auth hook `hook_require_verified_signup` (Before User Created) refuses email accounts without that stamp
  - These three read only `purpose = 'signup'` codes in `otp_codes`
- Password reset (flag `auth-password-reset`) uses the same table with `purpose = 'reset'`:
  - `send-reset-code` `{ email }` → same answer and same work whether or not the email has an account
  - `reset-password` `{ email, code, password }` → 5 tries, then sets the password with the admin API
- Codes are emailed via Resend from `noreply@mahitechnology.com`. Test with real inboxes (Gmail works;
  Maildrop dropped the email, 2026-10-01)
- App Store review: provide Apple a **real seeded account** (created via the normal OTP flow) or a
  TestFlight build — there is **no hardcoded bypass** in the client. (The previous
  `appreview@togethermahi.com` / `1234` backdoor was removed; it shipped a working credential in the
  production binary.)

## Location / Privacy (per-post location)
- Per-post location is **explicit opt-in** — never silent, and **never requested at onboarding**. Ask only on first use that needs it (e.g. a post attempt with location enabled), mirroring the camera-permission pattern.
- The consent decision (`granted` / `denied`) is **cached locally in AsyncStorage** (`@mahi:location_consent`, via `src/lib/location.ts`) so the user is asked **once** — the OS remembers too, but the cache prevents re-prompt churn.
- Coordinates are **rounded to ~city-block precision** (3 decimal places ≈ 110m) via `roundCoord` before they ever leave `location.ts`, to avoid exact-home exposure. Low-quality fixes (accuracy worse than ~100m) are **dropped** (`null`).
- A one-shot `getCurrentPositionAsync` (Balanced accuracy) is used — **not** a watch — for battery. Denials/errors degrade to `null`/`false` and never throw to the caller; a post without location stays valid.
- Coordinates inherit the **post's public-read RLS** — there is no separate authz on the columns, so **anyone who can see the post can see its (rounded) coordinates**. RLS is unchanged and must not be weakened.

## Camera / Upload Flow
- Two taps, two photos (the second tap stays; no auto timer). Shutter captures only — no upload until
  the user taps Post on the preview screen. Microphone permission is never requested (the native
  usage string in `app.config.js` goes at the next native build)
- Photo preview renders in a `Modal` that slides in from the right — never use `absoluteFillObject` inside the camera slot (conflicts with VerticalNavigator `overflow: hidden` and AppHeader overlay)
- Optimistic updates (`addPending`, streak increment) fire at Post confirmation, not at shutter
- Upload order: `uploadPostPhotos` (`posts/{userId}/{clientId}_rear.jpg` / `_pov.jpg`, upsert) →
  `createPost` = the `create_post` RPC, one server call that dates the post, records the streak and
  saves tags, deadlines and pushes. A retry with the same `clientId` returns the same post
- On any failure: remove pending post, revert streak, and `removePostPhotos` the uploaded paths
- `posts` storage bucket is still **public** (`supabase/deferred/private_bucket.sql` makes it private later)
- One post per day: server (unique index, `create_post`) plus the client-side `hasPostedToday` guard
- `hasPostedToday` disables shutter + flip at 0.3 opacity and shows the "Streak secured" state

## Auth
- Supabase is the source of truth for auth
- Sessions persist via AsyncStorage (`autoRefreshToken: true`, `persistSession: true` in `src/lib/supabase.ts`)
- `onAuthStateChange` in `App.tsx` drives all screen transitions — no manual `authDone` flags
- User creation uses `complete-signup` Edge Function (admin API, `email_confirm: true`)
- Profile data is inserted into `public.profiles` after successful `signInWithPassword`
- Sign-up keeps date of birth and phone number as required fields (founder, 2026-10-01)
- Log in → "Forgot password?" (`ForgotPasswordSheet`, `OtpCodeInput`) emails a code; code + new password log you in
- Settings → "Delete account" (flag `account-delete`; Apple requires in-app deletion) asks once, then calls
  `delete-account`: photos removed, auth user deleted, every table cascades
  (`20261001100100_account_delete_cascade`)

## State Management
- Zustand stores, all exported from `src/store/index.ts`: auth, user, signUp, theme, feed, messages,
  conversation, notifications, profilePosts, social, follow, suggest, block, push, tag, invite
  (`toastStore` is imported directly). Every per-user store's `reset()` is called in the `App.tsx`
  sign-out branch (auth comes from the session; theme and sign-up form survive sign-out)
- Sign-up form state lives in `useSignUpStore` (persists across app backgrounding mid-flow)
- Only the resend cooldown timestamp is kept on the device (`src/lib/otp.ts`); codes are server-only
- When writing back to profile after async work, always read from `useUserStore.getState().profile` — never spread a closure snapshot

## Rest Days / Training Days
- `profiles.fitness_routine` stores comma-separated **full day names** (e.g. `'Monday,Wednesday,Friday'`) — these are training days
- Days **not** in `fitness_routine` are rest days — the `record_upload_streak` DB function exempts rest days from streak-breaking
- The DB function uses `to_char(date, 'Dy')` (3-letter abbreviation) with `position()` to check membership — this works because each abbreviation is a substring of only its corresponding full name
- Client-side rest-day check uses `new Date().toLocaleDateString('en-US', { weekday: 'long' })` to get the full day name in device timezone
- `RestDaysStreakPanel` (native page sheet opened from Profile) lets users edit their training days post-signup
- Open question (founder, parked 2026-10-01): whether a skipped rest day protects the streak — see `docs/decisions.md`
- `updateFitnessRoutine(userId, routine)` in `src/api/profile.ts` persists changes; store is updated via `setProfile({ ...profile, fitness_routine })` after save
- Sentry breadcrumbs/exceptions are logged for training-day screen open, save success, and save failure

## Sentry Logging
- `Sentry.captureException(err, { tags: { flow, action? }, extra })` for caught errors
- `Sentry.addBreadcrumb({ category, message, level })` for navigation/action events
- `console.error('[ComponentName]')` alongside Sentry for dev debugging
- Sentry only enabled in production (`EXPO_PUBLIC_APP_ENV === 'production'`)

## Design System
- Font: Inter, only through `FONTS` in `src/constants/fonts.ts` (`Inter_400Regular`, `Inter_400Regular_Italic`,
  `Inter_600SemiBold`, `Inter_700Bold`, loaded in `App.tsx`). `fonts.test.ts` fails on a typed-out font name
- Every colour, text size, spacing, radius, shadow, size, offset, icon size, letter spacing, line height and
  border width comes from `src/constants/tokens.ts` (`withAlpha` for opacity). `designTokens.test.ts` fails on
  a raw value anywhere else — need a new value? add a token first
- UI copy is sentence case ("Log in", "Streak secured", "Day streak"). No all-caps, letter-spaced labels;
  the MAHI wordmark is the only exception (owner, 2026-10-01)
- Dark/light mode via `useAppTheme()` (the user's stored choice) — always support both
- Pop-ups are native: page sheets (`presentationStyle="pageSheet"`) for comments, tags, notifications,
  requests, blocked users, friends and the streak panels; `ActionSheetIOS` for menus
- The keyboard never covers a sheet, field or button — see CLAUDE.md (`KeyboardInset`)
