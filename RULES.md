# mahi-fitness — Project Rules for Claude

## Core loop (owner, 2026-10-09 — docs/core-workflow.md is the source of truth)

- Mahi is a **show-up fitness accountability app**, not a social-media app. Profiles, follows,
  messages, likes and comments support real accountability; they are not the primary loop. The
  tag-and-answer loop is the product's centre.
- The first post tags exactly 1 person: a friend on Mahi, someone on Mahi by a tag request, or one
  invite link sent from the phone. This includes people who joined from a tag link. Server:
  `create_post` with `app_config.first_post_tags` (1; 0 brings back the old rule). The app uses its
  own constant and never reads that setting.
- After the first post, you can post only while a tag on you is open. The camera says "Waiting for
  your next tag". Answering the tag **is** the next workout post; never present answering and
  posting as separate jobs.
- Every answer tags 3. One post answers every open tag; the countdown shows the earliest deadline.
- Each post earns at most 1 point. Deleting a post takes its point back (`delete_post`); Best never
  drops.
- A tagger loses nothing when their mates don't answer.
- The tag screen's Post button is the confirmation; there is no separate pop-up. Its footer says
  your mate(s) get 48 hours and the caption can be edited for 1 hour.
- The feed is earned, not browsed by default: it stays locked until the first post, then reopens
  through accountable check-ins under the feed-lock rules below.
- Tags are calls to show up. An answer passes accountability onwards by tagging friends for their
  own workout response. UI copy should say who is waiting, what workout action is due and how
  long remains; avoid social-media framing such as posting for reach, content or engagement.
- “Free post” and “opening check-in” are not UI language. User-facing
  copy says “Start by showing up” and “your first workout”; it sounds like a commitment, not a perk.
- A newcomer must be able to repeat the loop before signing up: **Show up & tag mates → Get tagged
  → Pass it on.** Entry, onboarding, camera and locked-feed states use those same verbs. Lead with
  the next physical action; explain points and feed access second.
- Guidance should feel like training, not documentation: numbered stages assemble in sequence, the
  current stage gets one restrained pulse, and connecting motion shows accountability passing on.
  Use native Liquid Glass interaction on supported iOS, bounded ripple on Android, and a still,
  fully readable version with Reduce Motion.
- Visual hierarchy is black/white/neutral first in both themes. Mahi blue is an accent for one
  active cue, time or brand moment—not a border around every card and control. Friend selection is
  a familiar avatar grid with names and tap-to-check; never show abstract numbered empty slots when
  the user is choosing people.

## Repo layout

- A pnpm workspace: the Expo app is in `ui/` (`App.tsx`, `app.config.js`, `eas.json`, `src/`,
  `assets/`), the waitlist site in `web/`, the database in `supabase/`, shared scripts in `scripts/`.
  Paths below without a folder (`App.tsx`, `app.config.js`) are the app's, in `ui/`.
- Run pnpm commands from the repo root (`pnpm typecheck`, `pnpm test`, `pnpm lint` hand over to `ui/`).
  Install with `pnpm --filter ./ui add <pkg>` (Expo packages: `cd ui && npx expo install <pkg>`).
  EAS commands run from `ui/`.

## Security (2026-10-08)

- `docs/security.md` is the security rulebook: database, server functions, links, staff portal, secrets,
  reviews and the review log. Read it before any database, server function, link or sign-in change.

## Branch and moderation (2026-10-06)

- Work happens on branch `updates` (reaches `main` by the owner's say-so); commit by name, never push without a same-session go.
- Moderation is server-side only: reports, staff actions and hiding go through the RPCs in
  `supabase/migrations/20261006100000_moderation.sql` (contract: `docs/moderation.md`). Never read
  `user_reports`, `moderation_actions` or `moderation_scans` from the app; never write `staff_users`
  from any app — staff are added by migration. Every staff action needs a reason (it goes in the audit log).
- New queries on posts and comments must leave out hidden posts (`hidden_at`) and removed comments
  (`removed_at`) unless the caller is staff.
- The automatic check (`moderate-content`) only flags; `app_config.ai_auto_hide` stays off unless the owner says.
- `staff/` is the staff portal web app (live database, not hosted yet): it talks to Supabase only through the staff RPCs,
  signed in as a `staff_users` member; it never uses the service role key in the browser.

## Messages and posts (2026-10-06)

- Messages go through the server functions only: `start_conversation`, `send_message`, `accept_message_request`,
  `decline_message_request`, `edit_message` (own message, 15 minutes), `unsend_message`; read with `get_inbox`,
  `get_messages`, `get_conversation_with`. Never insert, update or delete `messages` or `conversations` from the app
  (direct conversation writes are closed on the server by `20261007111029_contract_messages`, live).
- Owners can delete their posts through `delete_post`. Deleting takes back the point that post
  earned (`posts.earned_point`; points never go below 0, Best never drops) and never restores the
  first post (`profiles.has_posted_before` is permanent). Captions remain editable for one hour
  through `update_post_caption` (an edited caption is checked by moderation again).
- The tag screen's Post button is the confirmation (owner, 2026-10-09); there is no separate
  pop-up. Its footer says the tagged mates get 48 hours and the caption can be edited for 1 hour.
  A post never goes without the person seeing that footer.
- A post can be sent into a chat (owner, 2026-10-10; `share_post`, 1 to 10 people, migration
  `20261010100000_share_post_in_message`). The message carries `post_id`; its words are the optional
  note. The reader gets the post only under the usual rules (`can_view_post_for`: the owner's
  settings, blocks, bans, moderation, the reader's feed lock). A share is never an exception:
  otherwise the card says locked, private or gone and nothing of the post is sent. Sharing goes only
  through `share_post`; a live message with a `post_id` is re-read, not built on the phone.
- The share sheet (`ui/src/components/ShareSheet.tsx`, switch `share-sheet`, on for everyone) is
  Instagram's layout: search, a grid of friends, a row of round buttons. The friends grid loads
  fresh on every open and is never kept on the phone. Copy link uses React Native's built-in
  clipboard, probed before it shows (`ui/src/lib/copyLink.ts`); build 14 swaps in `expo-clipboard`.

## Follows, tag requests and invite links (2026-10-07; public/private accounts 2026-10-08)

- A normal profile Follow is one-way. Friends means both follow rows exist.
- Accounts are public or private (`profiles.is_private`, changed only through `set_account_controls`).
  A Follow to a public account is a follow straight away. A Follow to a private account is a request
  (`follow_requests`): `set_following` answers `status: 'requested'`; the owner confirms or deletes it
  (`respond_follow_request`); the requester is told only on acceptance; tapping Requested cancels.
  Going private keeps existing followers; going public accepts every pending request.
- Who sees your workouts (`posts_visibility`: everyone / followers / friends, starting at followers
  until the person chooses; everyone is not allowed while private) and who can tag you (`tag_permission`: everyone / approve first / friends only; shown as Everyone / Approved / Friends) are
  enforced on the server (`can_view_post`, `create_post`, `invite_to_tag`). The feed lock stays on top.
  Someone tagged on a post always sees that one post (not the poster's others), and the tagger always
  sees the post that answers their tag, unless blocked or banned (the feed lock still applies).
- Accepting an in-app tag request starts the tag but NO LONGER creates follows (owner, 2026-10-08).
  `respond_tag_invite` answers who follows whom and whether the tagger asked to follow, and the app
  offers Follow back / Accept their follow (optional). Declining creates nothing.
- Invite links: a tag invite tied to a post (a slot) makes both follow rows when claimed. A general
  invite ("invite a mate") from a private account: the inviter follows the claimer, and the
  claimer's follow is a request the inviter approves (`claim_invite` answers `follow_status`;
  `get_invite_preview` says `follow_request`). Before sharing or accepting, the UI says plainly which
  of the two happens; the accepted/joined state confirms it.
- An invite link opened by someone already signed in never claims by itself: a confirm sheet (Accept /
  Not now) comes first; Not now writes nothing (2026-10-08, `docs/security.md`).
- Profile follow/unfollow writes go only through `set_following` (the app has no write rights on `follows`
  from `20261008150000_security_hardening_live`); the store may update optimistically,
  but must reconcile from the RPC's committed state (following / requested / none). Friends/follow lists
  and follow requests always load fresh server data and subscribe to changes while open; never cache
  them on-device.
- Removing a follower (`remove_follower`) is silent; removing a Friend also ends the open tags between
  you, after a clear confirm sheet.

## Swipe pages and tab bar (2026-10-07; camera and feed combined 2026-10-08)

- Order, left to right, everywhere (tab bar, swipe pages, glass rail, screen-reader actions):
  Messages, Camera, Profile — three pages. The feed has no page or tab: it lives behind the camera on
  one screen (`CameraFeedPage`, decision #147). Camera is the landing page. Change the order only in
  `NATIVE_TABS` (`ui/src/lib/nativeTabs.ts`) and the page strip in `HorizontalNavigator`, which must match.
- The camera is the front sheet both ways (decisions #147–#150, #175): pull it down and it slides
  down to a portrait card with the roadmap behind it; swipe it up and it morphs all the way up, the feed
  filling the page (a locked feed: a small lift (about a sixth of the page) with the reason and one button).
  Every one of these is one swipe: no peek stop (the peeks looked stuck); it settles open or back by
  distance or flick. Where it settles: `releaseDetent` (`ui/src/lib/detent.ts`).
- Back from the open full-screen feed: at its first post a pull down runs the same morph backwards
  (`feedPullDown`, `ui/src/lib/feedPull.ts`, decision #176), a "Switch to camera" pill floats there, and
  the circle beside the bell takes you back too (it slides away with the header while you page down
  and returns with it), as does tapping the Camera tab (decision #184). The pull is a pan on the feed card that runs
  alongside the list's own Native gesture (like the page swipe) and only activates at the top with a
  downward drag; the full-screen list doesn't bounce or pull to refresh — it refreshes each time the
  feed opens. Rows (`feed-rows` on) keep pull to refresh and have no pull down.
- One gesture on the camera decides both directions (`cameraDrag` in `ui/src/lib/cameraPull.ts`), so the
  swipe up is as reliable as the pull down. Never add a second vertical pan beside it: nested pans
  compete and the outer one loses (13.23–13.29).
- Tapping a tab, or a button that opens a page, grows the page in (`pageMorphFrame`, decision #146);
  only a swipe slides the strip.
- Only a real sideways carousel may hold the page swipe (none today: the profile's carousel went with
  the compact header, 2026-10-10). Never hold it for a
  whole-screen list: every touch would hold the swipe and the page could not be left by swiping
  (the cause of "can't swipe from Profile", fixed in OTA 12.22).

## Live updates (2026-10-07)

- A table sends live updates only if it is in the `supabase_realtime` publication (check against prod
  with `pg_publication_tables`). Since `20261007150000_live_updates_and_hardening`: conversations,
  messages, notifications, tag_challenges, follows, post_likes, post_comments.
- Supabase can't filter DELETE events (they carry only the row id). Listen for DELETE without a
  filter and re-read, as `followStore` and `socialStore` do. A live INSERT row has no joined data:
  fetch what the screen shows (e.g. the commenter) before adding it.

## Database tools

- Mahi doesn't use Docker: no `supabase start`, no local stack. Database types come from the Supabase MCP
  generator (`generate_typescript_types`), not `supabase gen types --local`.
- Production writes only with the owner's permission, through `scripts/db.sh try` → `backup` → `push`.
- Migration names say what changes in the database (e.g. `delete_post_point`), never who asked for it.
  The guard refuses names with people's names or words like answers/round.

## Architecture & Adding Features

- 5-layer architecture, strict downward deps: `screens/components → hooks → stores → api → lib → supabase`.
  See the **Layering Contract** in `docs/architecture.md` for the per-layer import rules.
- To add a full-stack feature, follow `docs/adding-a-feature.md` (copy `follows.ts` / `followStore.ts` /
  `useNotifications.ts` as templates). Every new store's `reset()` MUST be wired into the `App.tsx` sign-out branch.
- Never read `process.env.*` directly — import the typed, fail-fast `env` from `ui/src/lib/env.ts`.
- New features ship behind a PostHog switch (`ui/src/lib/featureFlags.ts`); turning one on means 100%. Switches
  are temporary: once a feature is proven on phones, remove the switch so it's standard, and delete it in PostHog
  after every phone has that update (owner, 2026-10-06).

## Supabase Edge Functions

- Pre-auth functions (`send-otp`, `verify-otp`, `complete-signup`, `send-reset-code`, `reset-password`)
  and the cron-called `send-push` and `moderate-content` are deployed with `verify_jwt: false` (`--no-verify-jwt`)
- `delete-account` is the exception: deployed **with** JWT verification (the default); it acts on the caller
- Whatever the JWT setting, every function checks its caller itself: Bearer token via `auth.getUser` for
  person-facing functions, `X-Internal-Secret` for `send-push` / `moderate-content`, signature for webhooks
  (`docs/security.md`). Never take a user id from the request body
- Functions are deployed by the owner only; see `supabase/README.md`

## Email / OTP

- The server makes, stores (SHA-256 hash only) and checks every sign-up code; the app never sees
  the code except as the user types it.
  - `send-otp` `{ email }` → emails a 6-digit code, 10-minute expiry, send limits per email and per network address
  - `verify-otp` `{ email, code }` → checks it (5 tries), stamps `otp_codes.verified_at`
  - `complete-signup` `{ email, password, code }` → creates the account only for a code verified in the last 30 minutes
  - Auth hook `hook_require_verified_signup` (Before User Created) refuses email accounts without that stamp,
    and (from the `20261008100000_security_hardening` migration) without `app_metadata.signup_via = 'complete-signup'`, so the
    public sign-up address can't create email accounts. `complete-signup` also counts code tries (5)
  - These three read only `purpose = 'signup'` codes in `otp_codes`
- Password reset uses the same table with `purpose = 'reset'`:
  - `send-reset-code` `{ email }` → same answer and same work whether or not the email has an account
  - `reset-password` `{ email, code, password }` → 5 tries, then sets the password with the admin API and
    signs out every session of that account (2026-10-08)
- Codes are emailed via Resend from `noreply@mahitechnology.com`. Test with real inboxes (Gmail works;
  Maildrop dropped the email, 2026-10-01)
- App Store review: provide Apple a **real seeded account** (created via the normal OTP flow) or a
  TestFlight build — there is **no hardcoded bypass** in the client. (The previous
  `appreview@togethermahi.com` / `1234` backdoor was removed; it shipped a working credential in the
  production binary.)

## Location / Privacy (per-post location)

- Per-post location is **explicit opt-in** — never silent, and **never requested at onboarding**. Ask only on first use that needs it (e.g. a post attempt with location enabled), mirroring the camera-permission pattern.
- The consent decision (`granted` / `denied`) is **cached locally in AsyncStorage** (`@mahi:location_consent`, via `ui/src/lib/location.ts`) so the user is asked **once** — the OS remembers too, but the cache prevents re-prompt churn.
- Coordinates are **rounded to ~city-block precision** (3 decimal places ≈ 110m) via `roundCoord` before they ever leave `location.ts`, to avoid exact-home exposure. Low-quality fixes (accuracy worse than ~100m) are **dropped** (`null`).
- A one-shot `getCurrentPositionAsync` (Balanced accuracy) is used — **not** a watch — for battery. Denials/errors degrade to `null`/`false` and never throw to the caller; a post without location stays valid.
- Coordinates follow the post's visibility: only people allowed to see the post (`can_view_post`: the owner's workouts setting, not blocked, not banned, feed lock) get them, and a locked viewer gets them nulled. The `posts` table applies the same rule row by row (`20261008100000_security_hardening`, live 2026-10-08; see `docs/security.md`). Never loosen this.

## Camera / Upload Flow

- Two taps, two photos (the second tap stays; no auto timer). Shutter captures only — no upload until
  the user taps Post on the preview screen. Microphone permission is never requested (the native
  usage string in `app.config.js` goes at the next native build)
- Photo preview renders in a `Modal` that slides in from the right — never use `absoluteFillObject` inside the camera slot (conflicts with the swipe page's `overflow: hidden` and AppHeader overlay)
- Optimistic updates (`addPending`, the Mahi points increment) fire at the tag screen's Post (the confirmation), not at shutter
- Upload order: `uploadPostPhotos` (`posts/{userId}/{clientId}_rear.jpg` / `_pov.jpg`, upsert) →
  `createPost` = the `create_post` RPC, one server call that dates the post, records the Mahi points and
  saves tags, deadlines and pushes. A retry with the same `clientId` returns the same post
- On a failure: remove the pending post and revert the points. The uploaded paths go (`removePostPhotos`) only when the server refused the post; on a network failure the photos and the `clientId` are kept so Try again replays the same post (`create_post` returns it with `replayed: true`)
- `posts` storage bucket is **private** (`20261008100000_security_hardening`, live): a photo opens or signs only for its owner, staff, or someone the feed rule lets see the post; the app signs every photo
- Reactive posting (below): `create_post` checks `reactive_posting_open` and raises `'reactive posting: not tagged'`;
  the camera mirrors it with `reactivePostingGate()` (`ui/src/lib/reactivePosting.ts`), fed by the feed store's
  `unlockedUntil` (null until the first post) and the open tags — a spinner while loading, "No tags to answer" when closed; the server error maps to
  the same toast. No daily limit
- Tags on a post: the first post tags exactly 1 (Hold up ✋ → the tag screen, single pick); an answer tags 3. A wrong
  count is refused with `tag or invite N people` (detail `{required, max}`)

## Auth

- Supabase is the source of truth for auth
- Sessions persist in the keychain on build 13+ (`ui/src/lib/sessionStorage.ts`: expo-secure-store behind a native probe, readable after first unlock, this device only); builds 10–12 keep AsyncStorage, and an existing AsyncStorage session moves to the keychain on first read (`autoRefreshToken: true`, `persistSession: true` in `ui/src/lib/supabase.ts`)
- `onAuthStateChange` in `App.tsx` drives all screen transitions — no manual `authDone` flags
- User creation uses `complete-signup` Edge Function (admin API, `email_confirm: true`)
- Profile data is inserted into `public.profiles` after successful `signInWithPassword` — only the sign-up columns (column grant from the `20261008100000_security_hardening` migration); points, ban and dates are the server's
- Sign-up keeps date of birth and phone number as required fields (founder, 2026-10-01)
- Log in → "Forgot password?" (`ForgotPasswordSheet`, `OtpCodeInput`) emails a code; code + new password log you in
- Settings → Security and privacy → "Delete account" (Apple requires in-app deletion) asks once, then calls
  `delete-account`: photos removed, auth user deleted, every table cascades
  (`20261001100100_account_delete_cascade`)

## State Management

- Zustand stores, all exported from `ui/src/store/index.ts`: auth, user, signUp, theme, feed, messages,
  conversation, notifications, profilePosts, social, follow, suggest, block, push, tag, invite
  (`toastStore` is imported directly). Every per-user store's `reset()` is called in the `App.tsx`
  sign-out branch (auth comes from the session; theme and sign-up form survive sign-out)
- Sign-up form state lives in `useSignUpStore` (persists across app backgrounding mid-flow)
- Only the resend cooldown timestamp is kept on the device (`ui/src/lib/otp.ts`); codes are server-only
- Feed, inbox and conversation pages are server-authoritative. The stores cache rendered pages only:
  feed uses its server cursor, inbox uses ranged `get_inbox` pages, and a conversation asks
  `get_messages` for the cursor before its oldest loaded message. Never fabricate a later page locally.
- Supabase post-media links rotate. `ui/src/api/posts.ts` reuses each valid signed URL until five
  minutes before expiry, and remote post/avatar images use native `force-cache`; never persist feed
  rows or expired links on the device.
- When writing back to profile after async work, always read from `useUserStore.getState().profile` — never spread a closure snapshot

## What the feed shows (2026-10-07; rows 2026-10-08)

- The feed is the people you follow, newest first (`get_feed`). Of your own posts it shows only your
  latest, in its place by time (`latestOwnPostOnly` in `useFeed`); the rest stay on your Profile.
  Never reorder the feed in the app; the server's newest-first order is the order.
- Each post is a Messages-sized row (`FeedRow`): who, caption or time, likes and comments, two small
  previews. Tap → the full-screen TikTok view (`PostViewer` with `from="feed"`, the shared morph from the
  rear preview); hold → Apple's menu (`rowMenuItems`). Rows sit on the page background with hairline
  dividers.
- A locked feed sends no photo or caption; never fake one. Locked rows are blurred skeletons with mock
  counts. The reason and the one way out come from `lockPill`, which always gets the server's
  `has_posted_before` mark (`postedBefore`): someone who has posted is never told to post a first
  workout, even with no post left in the feed (13.31).

## Reactive posting and Mahi points

- You can post only while you have an open tag you can still answer (48 hours + 10 minutes grace); your very
  first post is the exception and tags exactly 1 (`app_config.first_post_tags`). No daily limit — the one-a-day unique index is dropped (`20261001120000_reactive_posting`)
- Server rule: `public.reactive_posting_open(user)`, checked inside `create_post`. App rule: `reactivePostingGate()`
  in `ui/src/lib/reactivePosting.ts`
- Mahi points (founder, 2026-10-02: "This is not streaks"): +1 for the first post and for each post that answers at
  least one tag, only for the person posting, no daily cap; deleting a post takes its point back; a missed tag puts
  them back to 0, even while logged out; Best is never lowered. People only ever
  see "points" and "Best" — never the word streak. There is no daily streak (parked)
- The database keeps the old names: `profiles.streak_current` = Mahi points, `streak_highest` = Best,
  `posts.streak_day` = the points after that post, `break_missed_streaks` (run from the `mark_missed_tags` cron
  and inside `create_post`) does the reset. Badges read "N points" (`ui/src/lib/mahiPoints.ts`), hidden at 0
- The old separate points (a point for the tagger, 3 a day, a total that never reset) are gone
  (`20261002170000_mahi_points`); there is no `mahi-points` flag — points always show
- Notifications: `streak_lost` (internal name; its words say "Your points are back to 0") to the person who
  missed (actor = the tagger); `tag_missed` only to the tagger
- Gone: rest days, training days, `fitness_routine`, `streak_logs`, `record_upload_streak`, the streak calendar.
  `20261001170000_drop_rest_days` removed the columns and table (live)

## Sentry Logging

- `reportError(err, { flow, action?, extra })` from `ui/src/lib/sentry.ts` in every catch and on every
  `{ error }` from Supabase (it also reads a server function's reply)
- `Sentry.addBreadcrumb({ category, message, level })` for navigation/action events
- In `__DEV__`, `reportError` also logs to the console; Sentry itself never sends from a dev machine
- Sentry sends from every installed build (preview, TestFlight, App Store) when a DSN is baked in, not
  only production; the environment is the update channel. Only the account id is set as the user
  (`Sentry.setUser({ id })`), never the email

## Design System

- Text: one type system for the whole app (owner, 2026-10-10; decision #195). One typeface, Inter Tight,
  in five weights (`FONTS` in `ui/src/constants/fonts.ts`, loaded in `App.tsx`; no italic, no
  `fontWeight`/`fontStyle` — the face is the weight). Every text style spreads ONE named style from
  `TYPOGRAPHY` in `ui/src/constants/typography.ts` (`...TYPOGRAPHY.body`): page title `screenTitle` 28,
  headings `h1`–`h4` 24/20/17/15, `sheetTitle` 22 bold (the owner's own value: "Keep them at 22"), `postBody` 17, `input` 15, `body` 14, `small` 13,
  `caption` 12, `micro` 11, `button` 14 bold. Emoji and other pictures drawn as text spread a `GLYPH` size.
  Nothing else sets a text size or a face; a missing style is added to `typography.ts`, never typed in a
  screen. The scale's values are pinned in
  `typography.test.ts`; change both together. Not in the scale on purpose: any 10pt style, a capitals `overline` and a monospace style.
  The native tab bar titles use the typeface too. `fonts.test.ts` fails on a typed-out font name, text without
  an Inter Tight face, or a character Inter Tight can't draw (✕ → ×). The website, staff portal and emails
  read the same family and weights (`FONT_FAMILY`, `web/scripts/font-weights.mjs`). Emoji pass: the phone's emoji font draws them; only the owner's own words use them (🔔 🔕 ✋ ⏳ 🎉, core workflow 2026-10-09)
- Every colour, text size, spacing, radius, shadow, size, offset, icon size, letter spacing, line height and
  border width comes from `ui/src/constants/tokens.ts` (`withAlpha` for opacity). So do the shared values:
  `ALPHA` (see-through amounts, also shadow strength), `STROKE` (icon line widths), `BLUR_INTENSITY`,
  `DURATION`, `SPRING` and `MOTION` (motion; shared pieces in `ui/src/components/Motion.tsx`, and with Reduce
  Motion on, movement becomes a fade), `SCALE`, `WAIT` (search wait, toast times), `SWIPE` (when a drag counts,
  moves or closes) and `LAYOUT` (columns, counts, screen shares). `designTokens.test.ts` fails on a raw value
  anywhere else, a numeric constant in a screen or raw layout maths — need a new value? add a token first.
  `app.config.js` can't import tokens, so the brand colour is typed once there (`ACCENT`) and the test checks it
  matches `COLORS.accent`
- Motion preserves continuity: when a person opens a workout tile or profile photo, the tapped
  object expands into its destination and reverses into place on close; camera capture resolves
  into the post preview rather than pushing in an unrelated page. Use the measured-clone pattern in
  `ui/src/components/MorphTransition.tsx` across native `Modal` boundaries (not Reanimated's
  experimental shared-element API). Destination video/content waits for the morph to land, drag-to-
  dismiss scrubs the same transition, unavailable geometry falls back to a fade, and Reduce Motion
  is always a crossfade.
- Controls that visibly open a related surface should preserve that relationship: glass pills and
  primary buttons compress under the finger, then their destination resolves with the same shape,
  tint and motion direction. Prefer native Liquid Glass on supported iOS builds, bounded tonal
  ripple on Android, and the shared `PressScale` fallback. Apply this to meaningful object-to-sheet
  transitions (accountability, caption, profile media), not every utility tap; one transition owns
  attention at a time.
- Card-to-destination motion uses `useCardMorphStyle`: one shared UI-thread progress value owns the
  card's position, size and corner radius. Camera minimisation, workout/post expansion and avatar
  expansion must reuse it rather than introducing separate geometry animation math.
- Animation-thread code (worklets: `useAnimatedStyle`, gesture callbacks) may only call functions
  marked `'worklet'`, and may only read numbers, flags and shared values held in local consts — never
  an object that also holds a gesture, a ref or a plain function (pass functions back with
  `scheduleOnRN`). Hooks go above every early `return`. Tests run on one thread and can't catch
  these: 13.08, 13.19 and 13.20 crashed on launch from exactly this. Lint must pass by exit status
  before any publish.
- Colours (owner, 2026-10-08): cards, circles, pills and buttons are solid black or white with the
  theme (`colors.text` fill, `colors.bg` words, or the reverse) — never a grey fill. Mahi blue
  (`COLORS.accent`) is for one active cue (the current step, the selected tab, an open arrow). Muted
  grey is for secondary words only.
- One padlock for every locked state: `LockIcon` in `ScreenIcons` (Apple's `lock` where SF Symbols are
  on). Never draw another.
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
- A short sheet at the bottom of the screen always goes through `ShortSheet` (decision #205): never a
  see-through `Modal` that slides (its grey layer slides up with it; `shortSheet.test.ts` fails on one).
  `native` on it asks for the phone's own short sheet, only for a sheet seen that way on a phone
- The keyboard never covers a sheet, field or button — see CLAUDE.md (`KeyboardInset`)
