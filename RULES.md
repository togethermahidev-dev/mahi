# mahi-fitness — Project Rules for Claude

## Architecture & Adding Features
- 5-layer architecture, strict downward deps: `screens/components → hooks → stores → api → lib → supabase`.
  See the **Layering Contract** in `docs/architecture.md` for the per-layer import rules.
- To add a full-stack feature, follow `docs/adding-a-feature.md` (copy `follows.ts` / `followStore.ts` /
  `useNotifications.ts` as templates). Every new store's `reset()` MUST be wired into the `App.tsx` sign-out branch.
- Never read `process.env.*` directly — import the typed, fail-fast `env` from `src/lib/env.ts`.

## Supabase Edge Functions
- All Edge Functions are deployed with `verify_jwt: false`
- These functions handle pre-auth flows (sign-up, OTP, email checks)
- This is the project-wide rule for all Edge Functions going forward

## Email / OTP
- OTP is generated client-side (`src/lib/otp.ts`), stored in AsyncStorage
- `send-otp` Edge Function receives `{ email, code }` — it only sends the email via Resend
- Verification is done entirely client-side by comparing against the stored OTPState
- Resend sender address: `onboarding@resend.dev`
  - TODO: change to `noreply@togethermahi.com` once SMTP is configured in Resend
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
- Shutter captures only — no upload until user taps POST on the preview screen
- Photo preview renders in a `Modal` that slides in from the right — never use `absoluteFillObject` inside the camera slot (conflicts with VerticalNavigator `overflow: hidden` and AppHeader overlay)
- Optimistic updates (`addPending`, streak increment) fire at POST confirmation, not at shutter
- Upload order: storage → `recordUpload(userId, localDate)` → `createPost(userId, url, streakResult.streak_current)`
- Always pass local date to `recordUpload`: `new Date().toLocaleDateString('en-CA')`
- On any upload failure: remove pending post, revert streak, and remove orphaned storage object
- `posts` storage bucket is **public** — use `getPublicUrl()` (not signed URLs)
- One post per day is enforced at three layers: DB unique index, RLS INSERT policy, and client-side `hasPostedToday` guard (compares `profile.streak_last_upload_date` to today's local date)
- `hasPostedToday` disables shutter + flip at 0.3 opacity and shows STREAK SECURED state

## Auth
- Supabase is the source of truth for auth
- Sessions persist via AsyncStorage (`autoRefreshToken: true`, `persistSession: true` in `src/lib/supabase.ts`)
- `onAuthStateChange` in `App.tsx` drives all screen transitions — no manual `authDone` flags
- User creation uses `complete-signup` Edge Function (admin API, `email_confirm: true`)
- Profile data is inserted into `public.profiles` after successful `signInWithPassword`

## State Management
- Zustand stores: `useAuthStore`, `useUserStore`, `useSignUpStore`, `useFeedStore`, `useMessagesStore`, `useProfilePostsStore`, `useFollowStore`, `useSocialStore` — all exported from `src/store/index.ts`
- Sign-up form state lives in `useSignUpStore` (persists across app backgrounding mid-flow)
- OTP state (sensitive) lives in AsyncStorage only, managed via `src/lib/otp.ts`
- When writing back to profile after async work, always read from `useUserStore.getState().profile` — never spread a closure snapshot

## Rest Days / Training Days
- `profiles.fitness_routine` stores comma-separated **full day names** (e.g. `'Monday,Wednesday,Friday'`) — these are training days
- Days **not** in `fitness_routine` are rest days — the `record_upload_streak` DB function exempts rest days from streak-breaking
- The DB function uses `to_char(date, 'Dy')` (3-letter abbreviation) with `position()` to check membership — this works because each abbreviation is a substring of only its corresponding full name
- Client-side rest-day check uses `new Date().toLocaleDateString('en-US', { weekday: 'long' })` to get the full day name in device timezone
- `TrainingDaysScreen` (full-screen overlay, slides from left) allows users to edit their training days post-signup
- `updateFitnessRoutine(userId, routine)` in `src/api/profile.ts` persists changes; store is updated via `setProfile({ ...profile, fitness_routine })` after save
- Sentry breadcrumbs/exceptions are logged for training-day screen open, save success, and save failure

## Sentry Logging
- `Sentry.captureException(err, { tags: { flow, action? }, extra })` for caught errors
- `Sentry.addBreadcrumb({ category, message, level })` for navigation/action events
- `console.error('[ComponentName]')` alongside Sentry for dev debugging
- Sentry only enabled in production (`EXPO_PUBLIC_APP_ENV === 'production'`)

## Design System
- Font: Josefin Sans — `JosefinSans_400Regular_Italic`, `JosefinSans_600SemiBold`, `JosefinSans_700Bold`
- Dark/light mode via `useColorScheme()` — always support both
- Colours: off-black `#1A1A17`, off-white `#E8E8E3`, bg dark `#1C1C19`, bg light `#FFFFFF`
- Input `borderRadius: 14`, button `borderRadius: 50` (pill), button width `72%`
- Padding: `32px` content, `24px` horizontal
