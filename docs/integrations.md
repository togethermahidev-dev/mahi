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
| `public.profiles` | `id`, `username`, `display_name`, `avatar_url`, `fitness_routine`, `streak_current`, `streak_highest`, `streak_lowest`, `streak_last_upload_date` | `fitness_routine`: comma-separated full day names (e.g. `'Monday,Wednesday,Friday'`) — training days; days absent are rest days. SELECT open to all authenticated users (feed joins and `searchProfiles` ILIKE queries require it). INSERT/UPDATE own only (`auth.uid() = id`). |
| `public.posts` | `id`, `user_id`, `image_url`, `pov_image_url`, `caption`, `streak_day`, `created_at` | `image_url` = rear/POV photo (default full-screen). `pov_image_url` = front selfie pip (nullable — null for legacy single-photo posts). Paginated cursor sort: `created_at DESC, id DESC`. Unique index `posts_user_day_unique` enforces one post per user per UTC day. RLS INSERT policy additionally blocks same-day inserts. |
| `public.post_likes` | `id`, `post_id`, `user_id`, `created_at` | Unique constraint `(post_id, user_id)`. RLS: authenticated read-all; insert/delete own only (`auth.uid() = user_id`). |
| `public.post_comments` | `id`, `post_id`, `user_id`, `content`, `created_at` | Ordered oldest-first. RLS: authenticated read-all; insert/delete own only. |
| `public.follows` | `id`, `follower_id`, `following_id`, `created_at` | Unique constraint `(follower_id, following_id)`. CHECK constraint prevents self-follows (`follower_id <> following_id`). RLS: authenticated read-all; insert/delete own only (`auth.uid() = follower_id`); explicit UPDATE deny policy (`USING (false)`). `followUser` uses idempotent upsert (`ignoreDuplicates: true`). |
| `public.conversations` | `id`, `participant_one`, `participant_two`, `status`, `initiated_by`, `updated_at` | `participant_one < participant_two` enforced by `ordered_participants` CHECK constraint. `conversations_participants_unique` UNIQUE INDEX on `(participant_one, participant_two)` required for upsert `ON CONFLICT`. `REPLICA IDENTITY FULL` set for Realtime UPDATE/DELETE events. |
| `public.messages` | `id`, `conversation_id`, `sender_id`, `content`, `created_at` | Trigger updates `conversations.updated_at` on insert. `REPLICA IDENTITY FULL` set for Realtime. Immutable — no UPDATE or DELETE. |
| `public.post_tags` | `post_id`, `user_id` | Junction table storing user tags on posts (user mentions in captions + on-photo bubble overlays). Composite PK `(post_id, user_id)` — dedup enforced at the DB layer. Both FKs use `ON DELETE CASCADE` (deleting a post or a profile also clears its tags). RLS: `SELECT using (true)` (tags are visible whenever the parent post is visible); `INSERT with check (exists (select 1 from posts p where p.id = post_id and p.user_id = auth.uid()))` — a user can only tag on posts they own. No UPDATE or DELETE policies (immutable v1; re-post to change). `post_tags_user_id_idx` btree on `user_id` for future "posts I was tagged in" lookups. `get_feed_posts` RPC aggregates these into a `tagged_users` array per post row. |
| `public.streak_logs` | `id`, `user_id`, `streak_count`, `started_at`, `ended_at`, `is_active`, `created_at` | Audit log managed by `record_upload_streak` RPC — tracks active and closed streaks |

Tag-loop, moderation, push and code tables (`tag_challenges`, `point_events`, `invites`, `app_config`,
`push_tokens`, `push_outbox`, `conversation_reads`, `notifications`, `user_blocks`, `user_reports`,
`otp_codes`, `auth_rate_limits`) are listed in [architecture.md](./architecture.md#database-schema) and
specified in [tag-loop-plan.md](./tag-loop-plan.md); their SQL is in `supabase/migrations/`.

### Database Indexes

| Index | Table | Definition | Purpose |
|---|---|---|---|
| `posts_user_day_unique` | `public.posts` | `UNIQUE (user_id, ((created_at AT TIME ZONE 'UTC')::date))` | Enforces one post per user per UTC calendar day at the DB layer |
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
- Called via `supabase.rpc('toggle_like', ...)` from `src/api/social.ts:toggleLike`.
- One round trip, no race condition, no need to check existing state first.

**Current app paths:** posting is `create_post` (one transaction: post, streak via `record_upload_streak`,
tags, deadlines, pushes, invites); the feed is `get_feed` (server-side lock, `feed-lock-explainer` reads its
unlock window); profiles read `get_user_posts`; chat sends through `send_message`. The entries below
describe the older functions, still live for old builds until `supabase/deferred/` retires them.

**`get_feed_posts(p_limit int, p_cursor_ts timestamptz, p_cursor_id uuid)`** — `SECURITY DEFINER STABLE` (legacy; the app now reads `get_feed`)
- Replaces the old `posts` table select + `FEED_SELECT` constant.
- Returns enriched feed rows including `like_count`, `comment_count`, `liked_by_me` (lateral `EXISTS` probe against `auth.uid()`), and `tagged_users` — an aggregated `{ user_id, username, display_name, avatar_url }[]` array built from a correlated `jsonb_agg(jsonb_build_object(...) order by tp.username)` subquery joining `post_tags` to `profiles`. The subquery result is wrapped in `coalesce(..., '[]'::jsonb)` so the column is **always an array, never NULL** — clients never need a `?? []` fallback and `FeedPost.tagged_users` is typed as required (`TaggedUser[]`, not `TaggedUser[] | null`).
- Cursor pagination: `p_cursor_ts` + `p_cursor_id` mirror the old `created_at DESC, id DESC` cursor. Both default to `null` for the first page.
- No longer called by the app (`getFeedPosts` was replaced by `getFeed`); kept live for old builds until `supabase/deferred/private_bucket.sql`.

**Old `createPost` client contract (before `create_post`; kept for history)**
- Inserts one row into `public.posts` and, if `taggedUserIds` is provided and non-empty, a second batch insert into `public.post_tags` using `Array.from(new Set(taggedUserIds))` for client-side dedup before the DB's composite-PK would reject duplicates.
- Returns `{ data, error }` with three possible shapes:
  - `{ data: PostRow, error: null }` — both inserts succeeded.
  - `{ data: null, error }` — the post insert itself failed; nothing was written.
  - `{ data: PostRow, error }` — **partial failure**: the post row was created but the subsequent `post_tags` insert failed. Callers must check both fields. `CameraScreen.uploadPhotos` treats this as "confirm the post, log the tag-insert error to Sentry with `tags: { flow: 'camera', action: 'post_tags_insert' }`, and keep going."
- RLS on `post_tags` requires the caller to own the post being tagged (`auth.uid() = posts.user_id`), so the second insert is safe to run immediately after the first.

**`record_upload_streak(p_user_id uuid, p_upload_date date)`** — `SECURITY DEFINER`
- Authoritative streak counter. Auth-guarded: rejects calls where `p_user_id <> auth.uid()`.
- Uses `SELECT ... FOR UPDATE` row lock to prevent double-tap race conditions.
- Idempotent: same-day calls return current values without incrementing.
- **Rest-day logic:** reads `profiles.fitness_routine` (comma-separated full day names). Uses `to_char(p_upload_date, 'Dy')` to get a 3-letter abbreviation and `position()` to check membership (works because 3-letter abbreviations are always a prefix/substring of the full name). If today is absent from the routine, it's a rest day — the streak extends without requiring a post. If today is a training day and the user missed it (no upload yesterday and not a rest day), the streak resets to 1.
- Manages `streak_logs` (opens new log on reset, updates count on extend).
- Returns `{ streak_current, streak_highest, streak_lowest, action }`.
- Called by `create_post` with the post's date in the user's own time zone (`profiles.timezone`, migration `timezone_postdate`); the app no longer calls it directly.

**`get_follow_data(p_current_user_id uuid, p_target_user_id uuid)`** — `STABLE SECURITY INVOKER`
- Returns `{ is_following: boolean, follower_count: bigint, following_count: bigint }` in a single query.
- `is_following`: uses `EXISTS` (index-only probe) — returns `false` when viewing own profile (`p_current_user_id = p_target_user_id`).
- `follower_count`: `COUNT(*)` where `following_id = target` (how many people follow the target).
- `following_count`: `COUNT(*)` where `follower_id = target` (how many people the target follows).
- Called via `supabase.rpc('get_follow_data', ...)` from `src/api/follows.ts:getFollowData`.
- Replaces three separate queries (check status + two count queries) with one round trip.

### Storage

**Bucket: `posts`** (public — images served via CDN)

- Upload paths: `{userId}/{clientId}_rear.jpg` and `{userId}/{clientId}_pov.jpg` (`uploadPostPhotos`, `upsert: true`, so a retry overwrites)
- Both images are uploaded in parallel via `Promise.all`
- Public URL: `supabase.storage.from('posts').getPublicUrl(path)` — works correctly because bucket is public
- Storage policies: users can insert/delete their own files; SELECT is open (public reads)
- On post failure after storage succeeds: `removePostPhotos(paths)` removes both
- Bucket `avatars` holds profile photos (`avatars/{userId}/…`). `delete-account` removes both folders for the caller
- The bucket goes private later (`supabase/deferred/private_bucket.sql`)

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

**Navigators** — `HorizontalNavigator` and `VerticalNavigator` page between screens with a manually-activated `Gesture.Pan`. Every activate/fail decision, release target and rubber-band comes from the worklet rules in `src/lib/swipeRules.ts` (tested in `swipeRules.test.ts`): axis ownership, system-edge exclusion, pull-down for search. The vertical pan runs alongside the Feed list's native scroll and reads its offset on the UI thread: a downward drag at the top of Feed (`atListTop`) goes to the navigator, and once the list has scrolled under the finger (`listMoved`) the drag stays with the list.

**Simultaneous-gesture rule (owner-verified on a phone, OTA 10.21):** the sideways pan, the up/down pan and the Feed list's `Gesture.Native()` must all be allowed to track the same touch. `HorizontalNavigator` makes `feedList` and a ref (`swipeRef`) and passes both to `VerticalNavigator`, whose pan fills the ref with `.withRef()` and is `.simultaneousWithExternalGesture(feedList)`; the sideways pan is `.simultaneousWithExternalGesture(feedList, verticalSwipe)`. The swipe rules keep them apart by axis — the up/down pan fails at once on a sideways drag. Leave out either relation and iOS hands the touch to the inner gesture, so sideways swipes on Camera or Feed silently stop working.

**RNGH `Gesture.Pan` + Reanimated** — localised drag surfaces:

| Surface | File | Pattern |
|---|---|---|
| `CameraScreen` pip (inside `DualPhotoPreview` Modal) | `src/screens/CameraScreen.tsx` | Long-press activation (`activateAfterLongPress(150)`), bounds-clamp to screen corners, corner-snap spring on end, Tap-race for swap. Lives in its own `GestureHandlerRootView` because the Modal spawns a separate native window. |
| Draggable pip | `src/components/DraggablePip.tsx` | Same pattern as CameraScreen pip (long-press + corner-snap + Tap-race). Shared by `FeedScreen` and `PostDetailModal`. |
| Nav rail | `src/components/NavRail.tsx` | Hold or drag along the rail to switch screens live (`nav-rail-morph`); its rectangle is excluded from page swipes. |
| Profile swipe-back | `src/screens/UserProfileScreen.tsx` | Pan to close a profile. |
| Settings drawer | `src/components/SettingsPanel.tsx` | Swipe left to close. |

**Feed list:** its scrolling is an RNGH `Gesture.Native()` made in `HorizontalNavigator` and shared with `VerticalNavigator`; both navigator pans are `simultaneousWithExternalGesture` with it. A vertical UIScrollView starts tracking after ~10pt in any direction, so without that relation it cancels a navigator pan before the 20px decision.

**Coexistence rule:** the navigators' pans activate only after their swipe rules decide (20px), so a nested `GestureDetector` (pip drag, profile swipe-back, settings swipe-to-close, the rail) that activates first keeps the touch.

**Root wrapping** — `App.tsx` wraps the whole tree in `GestureHandlerRootView` (required by RNGH). Components that render inside native `<Modal>` windows (e.g. `CameraScreen`'s `DualPhotoPreview`, `PostDetailModal`, `FollowListModal`, `BlockedUsersSheet`) must wrap their own root because a Modal is a separate native window and the app-level root does not cross that boundary. Components that render as plain absolute overlays (e.g. `GlobalSearchOverlay`, `UserProfileScreen`) rely on the app-level root and do **not** need their own.

**Shared-value pattern** — drag surfaces declare `useSharedValue` refs (e.g. `translateY`, `startY`, `viewportH`, `contentH`), read/write them inside `.onStart` / `.onUpdate` worklets (marked `'worklet'`), and consume them via `useAnimatedStyle` applied to a `Reanimated.View`. The `GestureDetector` must wrap the same `Reanimated.View` that consumes the animated style. Layout measurements flow via `onLayout` handlers that write directly to shared values (JS-thread writes to shared values are safe).

---

## PostHog — `src/lib/posthog.ts`

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
| `signup_completed` | `CreateAccountSheet.tsx` | Account created (includes `training_days`, `fitness_goals`) |
| `password_reset_code_sent` / `password_reset_done` / `password_reset_failed` | `ForgotPasswordSheet.tsx` | Password reset steps |
| `user_blocked` / `user_unblocked` / `user_reported` | `UserProfileScreen.tsx`, `BlockedUsersSheet.tsx` | Moderation |
| Tag-loop events (`tag_sent`, `tag_answered`, `tag_missed`, `invite_shared`, `invite_claimed`, `feed_unlocked`, …) | `src/lib/analytics.ts` (one typed map) | Sent after the server confirms |

Feature flags are read through the same client — see [feature-flags.md](./feature-flags.md).

**Required env vars:**
```
EXPO_PUBLIC_POSTHOG_API_KEY
EXPO_PUBLIC_POSTHOG_HOST   # default: https://us.i.posthog.com
```

---

## Sentry — `src/lib/sentry.ts`

**Status: Active**

Error and crash reporting via `@sentry/react-native` v8.

- `initSentry()` called at app startup in `index.ts`
- Config plugin in `app.config.js` (org: `mahi-org`, project: `react-native`)
- Only enabled when `EXPO_PUBLIC_APP_ENV === 'production'`
- `Sentry.setUser({ id, email })` set on login, cleared on logout (`App.tsx`)

**Instrumented flows:**

| Flow | File | Logging |
|---|---|---|
| Login | `LoginSheet.tsx` | `captureMessage` on sign-in error |
| Signup | `CreateAccountSheet.tsx` | `captureException` on OTP send / account creation failure; breadcrumbs for OTP sent, verified, account created |
| Search | `GlobalSearchOverlay.tsx` | `captureException` on search error; breadcrumbs for overlay open, profile tap |
| Camera upload | `CameraScreen.tsx` | `captureException` on upload failure |
| Training days | `RestDaysStreakPanel.tsx` | `captureException` on save failure; breadcrumbs for panel open, successful save |
| Follow | `UserProfileScreen.tsx` | `captureMessage` on toggle follow/unfollow error; breadcrumb on follow tap |

**Pattern:** use `Sentry.captureException(err, { tags: { flow }, extra })` for caught errors and `Sentry.addBreadcrumb({ category, message, level })` for navigation/action events. Use `console.error('[ComponentName]')` alongside for dev debugging.

**Required env vars:**
```
EXPO_PUBLIC_SENTRY_DSN
EXPO_PUBLIC_APP_ENV   # 'development' | 'production' — Sentry only active in production
```
