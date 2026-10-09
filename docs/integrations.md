# Integrations

## expo-splash-screen

**Status: Active**

Controls the native OS splash screen.

- Config plugin in `app.config.js` writes the splash colour to native at prebuild time
- Background `#59c2d7` (brand cyan) in both light and dark
- `SplashScreen.preventAutoHideAsync()` — called at module scope in `App.tsx`
- `SplashScreen.hideAsync()` — called from `onLayout` in `SplashScreen.tsx`

No splash image is set in the plugin (`assets/splash-icon.png` is unused). Add the final MAHI logo before a native prebuild if wanted.

---

## Supabase — `ui/src/lib/supabase.ts`

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
npx supabase gen types typescript --project-id <project-id> > ui/src/types/database.ts
```

### Database Tables

| Table | Key Columns | Notes |
|---|---|---|
| `public.profiles` | `id`, `username`, `display_name`, `avatar_url`, `timezone`, `streak_current`, `streak_highest`, `has_posted_before` | `streak_current`: Mahi points; `streak_highest`: Best. `has_posted_before` is permanent, so deleting every post never restores the first workout. SELECT open to authenticated users; INSERT/UPDATE own only. |
| `public.posts` | `id`, `user_id`, `image_url`, `pov_image_url`, `caption`, `streak_day`, `created_at` | Made under reactive posting. Owners edit captions through `update_post_caption` for one hour and delete through `delete_post`; direct table mutation stays denied. Media is returned through short-lived signed URLs, reused in memory until shortly before expiry. |
| `public.post_likes` | `id`, `post_id`, `user_id`, `created_at` | Unique constraint `(post_id, user_id)`. RLS: readable only on posts the reader can see (`can_view_post_id`; staff see all, `20261008120000`); insert own only on a visible post (`auth.uid() = user_id`); delete own only. |
| `public.post_comments` | `id`, `post_id`, `user_id`, `content`, `created_at` | Ordered oldest-first. RLS: readable only on posts the reader can see (`can_view_post_id`; your own and staff always, removed comments hidden, `20261008120000`); insert own only on a visible post; delete own only. |
| `public.follows` | `id`, `follower_id`, `following_id`, `created_at` | Unique constraint `(follower_id, following_id)`. CHECK constraint prevents self-follows (`follower_id <> following_id`). RLS: authenticated read-all; explicit UPDATE deny policy (`USING (false)`). No direct writes (insert/update/delete revoked, 20261008150000): follow and unfollow go through the `set_following` RPC (`setFollowing`); Friends are made by `claim_invite` / `respond_tag_invite`. |
| `public.conversations` | `id`, `participant_one`, `participant_two`, `status`, `initiated_by`, `updated_at` | `participant_one < participant_two` enforced by `ordered_participants` CHECK constraint. `conversations_participants_unique` UNIQUE INDEX on `(participant_one, participant_two)` required for upsert `ON CONFLICT`. `REPLICA IDENTITY FULL` set for Realtime UPDATE/DELETE events. |
| `public.messages` | `id`, `conversation_id`, `sender_id`, `content`, `created_at` | Trigger updates `conversations.updated_at` on insert. `REPLICA IDENTITY FULL` set for Realtime. Immutable — no UPDATE or DELETE. |
| `public.post_tags` | `post_id`, `user_id` | Junction table storing user tags on posts (user mentions in captions + on-photo bubble overlays). Composite PK `(post_id, user_id)` — dedup enforced at the DB layer. Both FKs use `ON DELETE CASCADE` (deleting a post or a profile also clears its tags). RLS: signed-in read only where the parent post is visible to the reader (the posts policy applies inside the check; hidden posts only for staff). No direct writes (insert/update/delete revoked, `20261008100000_security_hardening`): tags are added only by `create_post` and `start_tag`. `post_tags_user_id_idx` btree on `user_id` for future "posts I was tagged in" lookups. `get_feed` aggregates these into a `tagged_users` array per post row. |

Tag-loop, moderation, push and code tables (`tag_challenges`, `invites`, `app_config`,
`push_tokens`, `push_outbox`, `conversation_reads`, `notifications`, `user_blocks`, `user_reports`,
`otp_codes`, `auth_rate_limits`) are listed in [architecture.md](./architecture.md#database-schema) and
specified in [tag-loop-plan.md](./tag-loop-plan.md); their SQL is in `supabase/migrations/`.

### Database Indexes

| Index | Table | Definition | Purpose |
|---|---|---|---|
| `posts_user_day_unique` | `public.posts` | *dropped* | Was one post per user per day (later per local `post_date`); removed by `20261001120000_reactive_posting.sql` — no daily limit |
| `conversations_participants_unique` | `public.conversations` | `UNIQUE (participant_one, participant_two)` | Enables `ON CONFLICT (participant_one, participant_two)` upsert for `createOrGetConversation` |
| `convos_p1_idx` | `public.conversations` | `(participant_one, updated_at DESC)` | Fast fetch of conversations where user is participant_one, sorted by recency |
| `convos_p2_idx` | `public.conversations` | `(participant_two, updated_at DESC)` | Fast fetch of conversations where user is participant_two, sorted by recency |
| `follows_unique` | `public.follows` | `UNIQUE (follower_id, following_id)` | Prevents duplicate follows; enables idempotent upsert with `ON CONFLICT` |
| `idx_follows_follower` | `public.follows` | `(follower_id)` | Fast lookup of who a user follows (following count) |
| `idx_follows_following` | `public.follows` | `(following_id)` | Fast lookup of a user's followers (follower count) |
| `post_tags_user_id_idx` | `public.post_tags` | `(user_id)` | Btree for "posts I was tagged in" lookups (mentions-inbox future) |

### Database Functions

**`toggle_like(p_post_id uuid, p_user_id uuid)`** — `SECURITY DEFINER`
- Atomic like toggle. Inserts a like row; if a conflict occurs (already liked), deletes instead.
- Returns `{ liked: boolean, like_count: bigint }` — the final state after the operation.
- Called via `supabase.rpc('toggle_like', ...)` from `ui/src/api/social.ts:toggleLike`.
- One round trip, no race condition, no need to check existing state first.

**Current app paths:** posting is `create_post` (one transaction: the reactive-posting check
`reactive_posting_open` — raises `reactive posting: not tagged` — then post, Mahi points, tags, deadlines,
pushes, invites); the feed is `get_feed` (server-side lock; the app reads its unlock window);
profiles read `get_user_posts`; chat sends through `send_message`. The entries below
describe older functions, now retired and kept for history: `get_feed_posts` was revoked from every app
role by `20261008100000_security_hardening` and is dropped by `20261008160000_drop_dead_functions`
(live 2026-10-08).

**`get_feed_posts(p_limit int, p_cursor_ts timestamptz, p_cursor_id uuid)`** — `SECURITY DEFINER STABLE` (legacy; the app now reads `get_feed`)
- Replaces the old `posts` table select + `FEED_SELECT` constant.
- Returns enriched feed rows including `like_count`, `comment_count`, `liked_by_me` (lateral `EXISTS` probe against `auth.uid()`), and `tagged_users` — an aggregated `{ user_id, username, display_name, avatar_url }[]` array built from a correlated `jsonb_agg(jsonb_build_object(...) order by tp.username)` subquery joining `post_tags` to `profiles`. The subquery result is wrapped in `coalesce(..., '[]'::jsonb)` so the column is **always an array, never NULL** — clients never need a `?? []` fallback and `FeedPost.tagged_users` is typed as required (`TaggedUser[]`, not `TaggedUser[] | null`).
- Cursor pagination: `p_cursor_ts` + `p_cursor_id` mirror the old `created_at DESC, id DESC` cursor. Both default to `null` for the first page.
- No longer called by the app (`getFeedPosts` was replaced by `getFeed`); revoked from every app role by `20261008100000_security_hardening`.

**Old `createPost` client contract (before `create_post`; kept for history)**
- Inserts one row into `public.posts` and, if `taggedUserIds` is provided and non-empty, a second batch insert into `public.post_tags` using `Array.from(new Set(taggedUserIds))` for client-side dedup before the DB's composite-PK would reject duplicates.
- Returns `{ data, error }` with three possible shapes:
  - `{ data: PostRow, error: null }` — both inserts succeeded.
  - `{ data: null, error }` — the post insert itself failed; nothing was written.
  - `{ data: PostRow, error }` — **partial failure**: the post row was created but the subsequent `post_tags` insert failed. Callers must check both fields. `CameraScreen.uploadPhotos` treats this as "confirm the post, log the tag-insert error to Sentry with `tags: { flow: 'camera', action: 'post_tags_insert' }`, and keep going."
- RLS on `post_tags` requires the caller to own the post being tagged (`auth.uid() = posts.user_id`), so the second insert is safe to run immediately after the first.

**`reactive_posting_open(p_user uuid)`** / **`break_missed_streaks(p_user uuid default null)`** — internals, not granted to `authenticated` (`20261001120000_reactive_posting.sql`)
- `reactive_posting_open`: true when the person has never posted or has an open tag they can still answer (48 hours + `app_config.answer_grace`, 10 minutes). `create_post` raises `reactive posting: not tagged` otherwise.
- `break_missed_streaks`: every run-out, unanswered, uncancelled tag not yet counted puts its person's `streak_current` back to 0 (once per tag); run by the `mark_missed_tags` cron and inside `create_post` for the caller. `streak_highest` is never lowered.
- The Mahi points move inside `create_post`: +1 for the first post and for each post that answers at least one tag, written to `posts.streak_day`; `posts.earned_point` marks a post that earned one, and `delete_post` takes it back unless a later missed tag already reset the points (`20261009100000_first_post_tag_and_post_points`). `record_upload_streak` and `streak_logs` are gone (the function dropped by `reactive_posting`, the table by `20261001170000_drop_rest_days`).

**`get_follow_data(p_current_user_id uuid, p_target_user_id uuid)`** — `STABLE SECURITY INVOKER`
- Returns `{ is_following: boolean, follower_count: bigint, following_count: bigint }` in a single query.
- `is_following`: uses `EXISTS` (index-only probe) — returns `false` when viewing own profile (`p_current_user_id = p_target_user_id`).
- `follower_count`: `COUNT(*)` where `following_id = target` (how many people follow the target).
- `following_count`: `COUNT(*)` where `follower_id = target` (how many people the target follows).
- Called via `supabase.rpc('get_follow_data', ...)` from `ui/src/api/follows.ts:getFollowData`.
- Replaces three separate queries (check status + two count queries) with one round trip.

### Storage

**Bucket: `posts`** (private since `20261008100000_security_hardening` — the app opens every photo
through a short-lived signed URL, for the owner, staff or someone the feed rule lets see the post)

- Upload paths: `{userId}/{clientId}_rear.jpg` and `{userId}/{clientId}_pov.jpg` (`uploadPostMedia`, `upsert: true`, so a retry overwrites). A video shot (flag `video-posts`) is `_rear|_pov.mov` (iPhone) or `.mp4` (Android)
- Limits (migration `20261002100000_video_posts`): `image/jpeg`, `video/quicktime`, `video/mp4`, up to 50 MB a file
- Both shots are uploaded in parallel via `Promise.all`
- Photos are read through short-lived signed URLs (`createSignedUrls`); the bucket is private
- Storage policies: users can insert/delete their own files; SELECT only for the owner, staff, or a viewer the feed rule allows (`can_view_post_object`)
- On post failure after storage succeeds: `removePostPhotos(paths)` removes both
- Bucket `avatars` holds profile photos (`avatars/{userId}/…`). `delete-account` removes both folders for the caller
- The bucket is private since `20261008100000_security_hardening` (was `supabase/deferred/private_bucket.sql`)

### Edge Functions

All functions run with `verify_jwt: false` (pre-auth flows) except `delete-account`, which keeps JWT
verification on. Live versions checked against prod 2026-10-01. Full details: [supabase/README.md](../supabase/README.md).

| Function | Purpose |
|---|---|
| `send-otp` | Receives `{ email }`, makes and stores a hashed 6-digit sign-up code (`purpose = 'signup'`), emails it via Resend from `noreply@mahitechnology.com` |
| `verify-otp` | Receives `{ email, code }`, checks a sign-up code server-side and marks it verified |
| `complete-signup` | Receives `{ email, password, code }`, creates the auth user (`email_confirm: true`) only for a verified sign-up code |
| `send-reset-code` | Receives `{ email }`, emails a reset code (`purpose = 'reset'`); same answer whether or not the account exists (flag `auth-password-reset`) |
| `reset-password` | Receives `{ email, code, password }`, checks the reset code, sets the new password |
| `delete-account` | No body; the caller's token says who. Removes their photos, then their auth user; every table cascades (flag `account-delete`) |
| `send-push` | Push outbox sender for pg_cron — in the repo, **not deployed yet** |

`check-email` is also live but not in this repo.

### Realtime

Supabase Realtime (`postgres_changes`) is used for live social updates on the feed and for live messaging.

Both `conversations` and `messages` tables are added to the `supabase_realtime` publication with `REPLICA IDENTITY FULL`, ensuring all columns are present in WAL events for UPDATE and DELETE.

**Important:** `postgres_changes` bypasses RLS at the WAL level — row data is transmitted to all subscribers before any RLS check. Use server-side `filter:` on channels wherever possible to limit data transmitted over the wire.

#### Social feed subscriptions (per-post)

`socialStore` opens one channel per visible post (`social:{postId}`). Channels are managed from `FeedScreen` via `onViewableItemsChanged` — only posts currently in the viewport maintain an open channel (~3–5 at a time). The store uses ref-counting so a channel is created once and destroyed only when truly no longer needed.

**Events:**
- `post_likes` — any change (`*`) on a post → re-fetch authoritative count → `feedStore.patchPost`
- `post_comments` — `INSERT` on a post → append to `socialStore.comments[postId]` if loaded + `patchPost comment_count +1`

```ts
useSocialStore.getState().subscribeToPost(postId);    // FeedScreen onViewableItemsChanged
useSocialStore.getState().unsubscribeFromPost(postId);
useSocialStore.getState().reset();  // on sign-out — closes all channels
```

#### Inbox subscriptions (per-user)

`messagesStore` opens two channels per authenticated user to receive new conversations and status changes. Two channels are required because a user can be either `participant_one` or `participant_two`, and `postgres_changes` supports only a single equality `filter` per subscription.

| Channel key | Filter | Events | Handler |
|---|---|---|---|
| `inbox_p1:{userId}` | `participant_one=eq.{userId}` | INSERT, UPDATE | INSERT → `sync(userId)`; UPDATE `status=active` → optimistic move request → inbox |
| `inbox_p2:{userId}` | `participant_two=eq.{userId}` | INSERT, UPDATE | Same as above |

```ts
useMessagesStore.getState().subscribeToInbox(userId);   // called by useMessages() useEffect
useMessagesStore.getState().unsubscribeFromInbox(userId);
useMessagesStore.getState().reset();  // on sign-out — closes all channels
```

#### Conversation subscriptions (per-thread)

`useConversation` hook opens one channel per open conversation thread. Managed entirely within the hook's `useEffect` — created on mount, removed on unmount via `supabase.removeChannel(channel)`.

| Channel key | Filter | Event | Handler |
|---|---|---|---|
| `convo:{conversationId}` | `conversation_id=eq.{conversationId}` | INSERT | Dedup and append message; call `patchConversationLastMessage` to update inbox preview |

---

## expo-linear-gradient

**Status: Active**

Used for two gradient overlays:

1. **`AppHeader` background** — `LinearGradient` fills the header absolutely, fading from opaque at the top to transparent at the bottom. Dark mode / Camera: `rgba(17,17,17,0.88) → rgba(17,17,17,0)`. Light mode: `rgba(255,255,255,0.92) → rgba(255,255,255,0)`.

2. **Post image overlay** (`FeedScreen` `PostItem`) — `LinearGradient` positioned absolutely over the top of each post image (`colors={['rgba(0,0,0,0.6)', 'transparent']}`), providing contrast for the overlaid username, timestamp, and streak pill.

Installed via `npx expo install expo-linear-gradient` (`~57.0.2`).

---

## expo-blur

**Status: Active**

Used for the `GlobalSearchOverlay` frosted-glass background (theme-aware `tint`, opened by pulling down on Camera), the tag/caption glass pills, `TaggedBubbleStack`, and as the `NavRail` fallback where Liquid Glass isn't available.

Installed as `~57.0.3`. `expo-glass-effect` (`~57.0.4`) draws the nav rail's glass on iOS versions that support it.

---

## react-native-gesture-handler + react-native-reanimated

**Status: Active** — `react-native-gesture-handler ~2.32.0`, `react-native-reanimated 4.5.1`, `react-native-worklets 0.10.1`. The only `PanResponder` left is `GlobalSearchOverlay`'s swipe-up-to-close.

All drag gestures use RNGH `Gesture.Pan` + Reanimated shared values, running on the UI thread — the full-screen navigators as well as localised drag surfaces.

**Navigator** — `HorizontalNavigator` pages sideways between Messages ⇄ Feed ⇄ Camera ⇄ Profile with one manually-activated `Gesture.Pan` (no up/down page swiping since 2026-10-05, decision #60). Every activate/fail decision, release target and rubber-band comes from the worklet rules in `ui/src/lib/swipeRules.ts` (tested in `swipeRules.test.ts`): sideways only, system-edge exclusion, the rail's rectangle.

**Simultaneous-gesture rule (owner-verified on a phone, OTA 10.21):** the page pan and each page's list (`Gesture.Native()`: `feedList`, `profileList`, `messagesList`) must be allowed to track the same touch — the pan is `.simultaneousWithExternalGesture(feedList, profileList, messagesList)`. Leave a list out and iOS hands the touch to it, so sideways swipes on that page silently stop working.

**RNGH `Gesture.Pan` + Reanimated** — localised drag surfaces:

| Surface | File | Pattern |
|---|---|---|
| `CameraScreen` pip (inside `DualPhotoPreview` Modal) | `ui/src/screens/CameraScreen.tsx` | Long-press activation (`activateAfterLongPress(150)`), bounds-clamp to screen corners, corner-snap spring on end, Tap-race for swap. Lives in its own `GestureHandlerRootView` because the Modal spawns a separate native window. |
| Draggable pip | `ui/src/components/DraggablePip.tsx` | Same pattern as CameraScreen pip (long-press + corner-snap + Tap-race). Inside `PostCard`, shared by `FeedScreen` and `PostViewer`. |
| Nav rail | `ui/src/components/NavRail.tsx` | Hold or drag along the rail to switch screens live (`nav-rail-morph`); its rectangle is excluded from page swipes. |
| Profile swipe-back | `ui/src/screens/UserProfileScreen.tsx` | Pan to close a profile. |
| Settings page sheet | `ui/src/components/SettingsPanel.tsx` | Appearance icon in the header; Notifications; nested Security and privacy; Support/Help. Swipe down to close. |

**Page lists:** the Feed, Profile and Messages lists' scrolling is each an RNGH `Gesture.Native()` made in `HorizontalNavigator` and lent to the list through `ListGestureContext` / `GestureScrollView`; the page pan is `simultaneousWithExternalGesture` with all three. A vertical UIScrollView starts tracking after ~10pt in any direction, so without that relation it cancels the page pan before the 20px decision.

**Coexistence rule:** the page pan activates only after their swipe rules decide (20px), so a nested `GestureDetector` (pip drag, profile swipe-back, settings swipe-to-close, the rail) that activates first keeps the touch.

**Root wrapping** — `App.tsx` wraps the whole tree in `GestureHandlerRootView` (required by RNGH). Components that render inside native `<Modal>` windows (e.g. `CameraScreen`'s `DualPhotoPreview`, `PostViewer`, `AvatarViewer`, `FollowListModal`, `BlockedUsersSheet`) must wrap their own root because a Modal is a separate native window and the app-level root does not cross that boundary. Components that render as plain absolute overlays (e.g. `GlobalSearchOverlay`, `UserProfileScreen`) rely on the app-level root and do **not** need their own.

**Shared-value pattern** — drag surfaces declare `useSharedValue` refs (e.g. `translateY`, `startY`, `viewportH`, `contentH`), read/write them inside `.onStart` / `.onUpdate` worklets (marked `'worklet'`), and consume them via `useAnimatedStyle` applied to a `Reanimated.View`. The `GestureDetector` must wrap the same `Reanimated.View` that consumes the animated style. Layout measurements flow via `onLayout` handlers that write directly to shared values (JS-thread writes to shared values are safe).

---

## PostHog — `ui/src/lib/posthog.ts`

**Status: Active**

Product analytics via `posthog-react-native`. Singleton client created with `EXPO_PUBLIC_POSTHOG_API_KEY`.

**Tracked events:**

| Event | File | When |
|---|---|---|
| `login_success` | `LoginSheet.tsx` | Successful sign-in |
| `login_failed` | `LoginSheet.tsx` | Sign-in error |
| `signup_otp_sent` | `CreateAccountSheet.tsx` | OTP email dispatched |
| `signup_otp_verified` | `CreateAccountSheet.tsx` | Server accepted the typed code |
| `signup_otp_rejected` | `CreateAccountSheet.tsx` | Server refused the typed code |
| `signup_otp_reused` | `CreateAccountSheet.tsx` | Back then Next reused the code already sent |
| `signup_completed` | `CreateAccountSheet.tsx` | Account created (includes `fitness_goals`) |
| `password_reset_code_sent` / `password_reset_done` / `password_reset_failed` | `ForgotPasswordSheet.tsx` | Password reset steps |
| `user_blocked` / `user_unblocked` / `user_reported` | `UserProfileScreen.tsx`, `BlockedUsersSheet.tsx` | Moderation |
| Tag-loop events (`tag_sent`, `tag_answered`, `tag_missed`, `streak_lost`, `invite_shared`, `invite_claimed`, `feed_unlocked`, …) | `ui/src/lib/analytics.ts` (one typed map) | Sent after the server confirms |

| Core actions: `user_followed` (`became_friends`), `user_unfollowed`, `post_liked`, `comment_added`, `message_sent` | the stores that make them | After the server saves the row; each carries the row id |
| Private accounts: `follow_requested`, `follow_request_cancelled` (`target_id`), `follow_request_answered` (`accepted`), `account_controls_changed` (`is_private`, `posts_visibility`, `tag_permission` as saved), `follower_removed` (`tags_ended`) | `followStore`, `followRequestStore`, `userStore` | After the server confirms; nothing for a refusal or a repeat |

Feature flags are read through the same client — see [feature-flags.md](./feature-flags.md).

**One person per account (`ui/src/lib/analyticsIdentity.ts`).** A PostHog person is the
Supabase user id (`identify` on sign-in). `reset()` runs only when the phone was carrying an
account (sign-out), and before a different account signs in on the same phone — never on a
signed-out launch, which used to make a new "person" every time (25 "users" for 6 accounts,
checked against prod 2026-10-07).

**Rules for events — no double numbers:**
- Send an action only after the server confirms it, from one place (the store that makes it),
  with its row id (`post_id`, `challenge_id`, `comment_id`, …) so a retry can be spotted.
- Never send the secret invite token or code, message text, captions, emails or phone numbers.

**Founder metrics dashboard:** https://eu.posthog.com/project/130791/dashboard/1004897 (pinned).
Signed-in people only. Active people (daily/weekly/monthly), stickiness, new signups, weekly and
day 1/7/30 retention, activation funnel (signed up → posted → answered a tag, 14 days), core
actions per week, churn watch (new / returning / back / gone quiet).

**Numbers of record — Supabase `stats` schema** (`20261007160000_founder_stats`): daily actions,
active people, retention, activation and weekly lifecycle computed from the database itself.
The `posthog_reader` role can read only those totals (no app table, no per-person rows). Once
the owner gives it a login and connects it as a PostHog Supabase source (schema `stats`), these
become the tiles to trust when PostHog and the database disagree.

**Required env vars** (EAS preview + production, "sensitive"):
```
EXPO_PUBLIC_POSTHOG_API_KEY   # project 130791
EXPO_PUBLIC_POSTHOG_HOST      # https://eu.i.posthog.com — the code default (us) is wrong for Mahi
```

---

## Sentry — `ui/src/lib/sentry.ts`

**Status: Active.** Error and crash reporting via `@sentry/react-native` v8. Org `mahi-org`,
project `react-native` (EU region, `mahi-org.sentry.io`).

**When it sends.** In every installed app (preview, TestFlight, App Store) once
`EXPO_PUBLIC_SENTRY_DSN` is baked in; never on a dev machine (`__DEV__`). The Sentry
*environment* is the update channel (`preview` / `production`), so test phones and real users
never mix. Every event is tagged `ota` (the OTA number), `update_id`, `runtime` and `channel`;
Sentry's own `release`/`dist` carry the app version and build number.

**How to report a failure — always `reportError`, never raw `Sentry.capture*`:**
```ts
import { reportError } from '@/lib/sentry';
const { error } = await supabase.rpc('set_following', …);
if (error) reportError(error, { flow: 'follows', action: 'setFollowing', extra: { otherUserId } });
```
It builds the report in `ui/src/lib/errorReport.ts` (pure, tested in
`ui/src/lib/__tests__/errorReport.test.ts`):
- **Title:** `follows.setFollowing failed: <what the server or code said> [code 42501] [HTTP 403]`.
- **Tags** to filter on: `flow`, `action`, `kind` (`database`, `auth`, `server-function`,
  `storage`, `network`, `app`), `code`, `http_status`.
- **"failure" context:** Supabase `details` and `hint`, the original message, your `extra`
  (keys like password/token/otp/pin are replaced with `[removed]`), and for a server function
  failure the function's own reply (`server_reply`, first 1000 characters) — that is where the
  real reason is.
- **Grouping:** one issue per flow + action + kind + code (ids and numbers in the message are
  ignored), so one bug is one issue however many people hit it.
- **Level:** `error`; a lost connection is `warning`; pass `level: 'fatal'` for a dead end.
- The original error is kept as `cause`, so its stack trace is shown too.

**Where to call it:** where the error stops travelling — a `catch` that doesn't rethrow, or a
Supabase `{ error }` handled on the spot. A function that throws or returns the error onward
does not report; its caller does. That keeps each failure counted once. Not reported (at most a
breadcrumb): wrong password or code typed by the person, a cancelled picker, a declined
permission, a native module missing from an older build.

**Also captured automatically:** crashes and unhandled promise rejections (SDK default), screen
render errors (`ErrorBoundary`, level `fatal`), and the taps before each error
(`Sentry.wrap(App)` in `ui/index.ts`). `Sentry.setUser({ id })` on sign-in (the account id only, never the email), cleared on
sign-out (`App.tsx`). Keep `Sentry.addBreadcrumb` for steps worth seeing in the trail.

**Readable stack traces.** `ui/metro.config.js` uses `getSentryExpoConfig`, which stamps each
bundle with a debug id. Native builds upload their source maps during the EAS build
(`SENTRY_AUTH_TOKEN` on EAS). OTA updates: `pnpm ota:preview "<message>"` publishes and then
runs `sentry-expo-upload-sourcemaps dist` (`scripts/ota-publish.cjs`); after a production OTA,
or if that upload fails, run `pnpm --dir ui sentry:sourcemaps` from the same checkout.

**Settings:**
| Where | Name | What |
|---|---|---|
| EAS preview + production, "sensitive" | `EXPO_PUBLIC_SENTRY_DSN` | Where the app sends errors. Must be on EAS: `eas update` ignores `ui/.env`. |
| EAS preview + production, secret | `SENTRY_AUTH_TOKEN` | Uploads source maps during builds. |
| `ui/.env` (local) | `SENTRY_AUTH_TOKEN`, `EXPO_PUBLIC_SENTRY_DSN` | Source map upload after an OTA; local runs. |

`EXPO_PUBLIC_APP_ENV` no longer decides whether Sentry sends.
