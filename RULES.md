# mahi-fitness — Project Rules for Claude

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
- App Store review bypass: `appreview@togethermahi.com` / `123456`

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
- Zustand stores: `useAuthStore`, `useUserStore`, `useSignUpStore`, `useFeedStore`, `useMessagesStore`, `useProfilePostsStore` — all exported from `src/store/index.ts`
- Sign-up form state lives in `useSignUpStore` (persists across app backgrounding mid-flow)
- OTP state (sensitive) lives in AsyncStorage only, managed via `src/lib/otp.ts`
- When writing back to profile after async work, always read from `useUserStore.getState().profile` — never spread a closure snapshot

## Design System
- Font: Josefin Sans — `JosefinSans_400Regular_Italic`, `JosefinSans_600SemiBold`, `JosefinSans_700Bold`
- Dark/light mode via `useColorScheme()` — always support both
- Colours: off-black `#1A1A17`, off-white `#E8E8E3`, bg dark `#1C1C19`, bg light `#FFFFFF`
- Input `borderRadius: 14`, button `borderRadius: 50` (pill), button width `72%`
- Padding: `32px` content, `24px` horizontal
