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
- Photo preview renders in a `Modal` that slides in from the right — never use `absoluteFillObject` inside the camera slot (conflicts with the swipe page's `overflow: hidden` and AppHeader overlay)
- Optimistic updates (`addPending`, the Mahi points increment) fire at Post confirmation, not at shutter
- Upload order: `uploadPostPhotos` (`posts/{userId}/{clientId}_rear.jpg` / `_pov.jpg`, upsert) →
  `createPost` = the `create_post` RPC, one server call that dates the post, records the Mahi points and
  saves tags, deadlines and pushes. A retry with the same `clientId` returns the same post
- On any failure: remove pending post, revert the points, and `removePostPhotos` the uploaded paths
- `posts` storage bucket is still **public** (`supabase/deferred/private_bucket.sql` makes it private later)
- Reactive posting (below): `create_post` checks `reactive_posting_open` and raises `'reactive posting: not tagged'`;
  the camera mirrors it with `reactivePostingGate()` (`src/lib/reactivePosting.ts`), fed by the feed store's
  `unlockedUntil` (null until the first post) and the open tags — a spinner while loading, "No tags to answer" when closed; the server error maps to
  the same toast. No daily limit

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

## Reactive posting and Mahi points
- You can post only while you have an open tag you can still answer (48 hours + 10 minutes grace); your very
  first post is free. No daily limit — the one-a-day unique index is dropped (`20261001120000_reactive_posting`)
- Server rule: `public.reactive_posting_open(user)`, checked inside `create_post`. App rule: `reactivePostingGate()`
  in `src/lib/reactivePosting.ts`
- Mahi points (founder, 2026-10-02: "This is not streaks"): +1 per post that answers at least one tag, only for
  the person answering, no daily cap; a missed tag puts them back to 0; Best is never lowered. People only ever
  see "points" and "Best" — never the word streak. There is no daily streak (parked)
- The database keeps the old names: `profiles.streak_current` = Mahi points, `streak_highest` = Best,
  `posts.streak_day` = the points after that post, `break_missed_streaks` (run from the `mark_missed_tags` cron
  and inside `create_post`) does the reset. Badges read "N points" (`src/lib/mahiPoints.ts`), hidden at 0
- The old separate points (a point for the tagger, 3 a day, a total that never reset) are gone
  (`20261002170000_mahi_points`); there is no `mahi-points` flag — points always show
- Notifications: `streak_lost` (internal name; its words say "Your points are back to 0") to the person who
  missed (actor = the tagger); `tag_missed` only to the tagger
- Gone: rest days, training days, `fitness_routine`, `streak_logs`, `record_upload_streak`, the streak calendar.
  `20261001170000_drop_rest_days` removes the columns and table once every phone has the new app

## Sentry Logging
- `Sentry.captureException(err, { tags: { flow, action? }, extra })` for caught errors
- `Sentry.addBreadcrumb({ category, message, level })` for navigation/action events
- `console.error('[ComponentName]')` alongside Sentry for dev debugging
- Sentry only enabled in production (`EXPO_PUBLIC_APP_ENV === 'production'`)

## Design System
- Font: Inter only, through `FONTS` in `src/constants/fonts.ts` (`Inter_400Regular`, `Inter_600SemiBold`,
  `Inter_700Bold`, loaded in `App.tsx`; no italic, no `fontWeight`/`fontStyle` — the face is the weight). The
  native tab bar titles use it too. `fonts.test.ts` fails on a typed-out font name, text without an Inter face,
  or a character Inter can't draw (✕ → ×, no emoji in UI copy)
- Every colour, text size, spacing, radius, shadow, size, offset, icon size, letter spacing, line height and
  border width comes from `src/constants/tokens.ts` (`withAlpha` for opacity). So do the shared values:
  `ALPHA` (see-through amounts, also shadow strength), `STROKE` (icon line widths), `BLUR_INTENSITY`,
  `DURATION` and `SPRING` (motion), `SCALE`, `WAIT` (search wait, toast times), `SWIPE` (when a drag counts,
  moves or closes) and `LAYOUT` (columns, counts, screen shares). `designTokens.test.ts` fails on a raw value
  anywhere else, a numeric constant in a screen or raw layout maths — need a new value? add a token first.
  `app.config.js` can't import tokens, so the brand colour is typed once there (`ACCENT`) and the test checks it
  matches `COLORS.accent`
- UI copy is sentence case ("Log in", "12 points", "No tags to answer", "Take photo"). No all-caps,
  letter-spaced labels; the MAHI wordmark is the only exception (owner, 2026-10-01). `sentenceCase.test.ts`
  fails on Title Case in on-screen text, pop-ups, menu options and labels (names like Apple keep capitals)
- Dark/light mode via `useAppTheme()` (the user's stored choice) — always support both. Parts handed `dark` as a
  prop use `themeColors(dark)` from the same file; both give the shared `muted` text and `border` colours
- The code email (`supabase/functions/_shared/email.ts`) uses the same tokens through the generated
  `emailTokens.ts` (`pnpm tokens:email`, never edited by hand; `pnpm test:scripts` fails on drift). The waitlist
  site reads them through the generated `web/app/tokens.css`
- Pop-ups are native: page sheets (`presentationStyle="pageSheet"`) for comments, tags, notifications,
  requests, blocked users and friends; `ActionSheetIOS` for menus
- The keyboard never covers a sheet, field or button — see CLAUDE.md (`KeyboardInset`)
