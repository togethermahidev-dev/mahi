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
| `public.profiles` | `id`, `username`, `display_name`, `avatar_url`, `fitness_routine`, `streak_current`, `streak_highest`, `streak_lowest`, `streak_last_upload_date` | `fitness_routine`: comma-separated full day names (e.g. `'Monday,Wednesday,Friday'`) — training days; days absent are rest days. SELECT open to all authenticated users (feed joins and `searchProfiles` ILIKE queries require it). INSERT/UPDATE own only (`auth.uid() = id`). |
| `public.posts` | `id`, `user_id`, `image_url`, `pov_image_url`, `caption`, `streak_day`, `created_at` | `image_url` = rear/POV photo (default full-screen). `pov_image_url` = front selfie pip (nullable — null for legacy single-photo posts). Paginated cursor sort: `created_at DESC, id DESC`. Unique index `posts_user_day_unique` enforces one post per user per UTC day. RLS INSERT policy additionally blocks same-day inserts. |
| `public.post_likes` | `id`, `post_id`, `user_id`, `created_at` | Unique constraint `(post_id, user_id)`. RLS: authenticated read-all; insert/delete own only (`auth.uid() = user_id`). |
| `public.post_comments` | `id`, `post_id`, `user_id`, `content`, `created_at` | Ordered oldest-first. RLS: authenticated read-all; insert/delete own only. |
| `public.follows` | `id`, `follower_id`, `following_id`, `created_at` | Unique constraint `(follower_id, following_id)`. CHECK constraint prevents self-follows (`follower_id <> following_id`). RLS: authenticated read-all; insert/delete own only (`auth.uid() = follower_id`); explicit UPDATE deny policy (`USING (false)`). `followUser` uses idempotent upsert (`ignoreDuplicates: true`). |
| `public.conversations` | `id`, `participant_one`, `participant_two`, `status`, `initiated_by`, `updated_at` | `participant_one < participant_two` enforced by `ordered_participants` CHECK constraint. `conversations_participants_unique` UNIQUE INDEX on `(participant_one, participant_two)` required for upsert `ON CONFLICT`. `REPLICA IDENTITY FULL` set for Realtime UPDATE/DELETE events. |
| `public.messages` | `id`, `conversation_id`, `sender_id`, `content`, `created_at` | Trigger updates `conversations.updated_at` on insert. `REPLICA IDENTITY FULL` set for Realtime. Immutable — no UPDATE or DELETE. |
| `public.post_tags` | `post_id`, `user_id` | Junction table storing user tags on posts (user mentions in captions + on-photo bubble overlays). Composite PK `(post_id, user_id)` — dedup enforced at the DB layer. Both FKs use `ON DELETE CASCADE` (deleting a post or a profile also clears its tags). RLS: `SELECT using (true)` (tags are visible whenever the parent post is visible); `INSERT with check (exists (select 1 from posts p where p.id = post_id and p.user_id = auth.uid()))` — a user can only tag on posts they own. No UPDATE or DELETE policies (immutable v1; re-post to change). `post_tags_user_id_idx` btree on `user_id` for future "posts I was tagged in" lookups. `get_feed_posts` RPC aggregates these into a `tagged_users` array per post row. |
| `public.streak_logs` | `id`, `user_id`, `streak_count`, `started_at`, `ended_at`, `is_active`, `created_at` | Audit log managed by `record_upload_streak` RPC — tracks active and closed streaks |

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

**`get_feed_posts(p_limit int, p_cursor_ts timestamptz, p_cursor_id uuid)`** — `SECURITY DEFINER STABLE`
- Replaces the old `posts` table select + `FEED_SELECT` constant.
- Returns enriched feed rows including `like_count`, `comment_count`, `liked_by_me` (lateral `EXISTS` probe against `auth.uid()`), and `tagged_users` — an aggregated `{ user_id, username, display_name, avatar_url }[]` array built from a correlated `jsonb_agg(jsonb_build_object(...) order by tp.username)` subquery joining `post_tags` to `profiles`. The subquery result is wrapped in `coalesce(..., '[]'::jsonb)` so the column is **always an array, never NULL** — clients never need a `?? []` fallback and `FeedPost.tagged_users` is typed as required (`TaggedUser[]`, not `TaggedUser[] | null`).
- Cursor pagination: `p_cursor_ts` + `p_cursor_id` mirror the old `created_at DESC, id DESC` cursor. Both default to `null` for the first page.
- Called via `supabase.rpc('get_feed_posts', ...)` from `src/api/posts.ts:getFeedPosts`.

**`createPost` client contract (not an RPC, lives in `src/api/posts.ts`)**
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
- Always pass `p_upload_date` as the device's **local** date (`new Date().toLocaleDateString('en-CA')`) — do not rely on server `CURRENT_DATE` (UTC) to avoid timezone drift.

**`get_follow_data(p_current_user_id uuid, p_target_user_id uuid)`** — `STABLE SECURITY INVOKER`
- Returns `{ is_following: boolean, follower_count: bigint, following_count: bigint }` in a single query.
- `is_following`: uses `EXISTS` (index-only probe) — returns `false` when viewing own profile (`p_current_user_id = p_target_user_id`).
- `follower_count`: `COUNT(*)` where `following_id = target` (how many people follow the target).
- `following_count`: `COUNT(*)` where `follower_id = target` (how many people the target follows).
- Called via `supabase.rpc('get_follow_data', ...)` from `src/api/follows.ts:getFollowData`.
- Replaces three separate queries (check status + two count queries) with one round trip.

### Storage

**Bucket: `posts`** (public — images served via CDN)

- Upload paths: `{userId}/{timestamp}_{rand}.jpg` (rear/POV), `{userId}/{timestamp}_{rand}_pov.jpg` (front selfie)
- Both images are uploaded in parallel via `Promise.all` in `CameraScreen`
- Upload: `supabase.storage.from('posts').upload(path, buffer, { contentType: 'image/jpeg' })`
- Public URL: `supabase.storage.from('posts').getPublicUrl(path)` — works correctly because bucket is public
- Storage policies: users can insert/delete their own files; SELECT is open (public reads)
- On upload failure after storage succeeds: call `supabase.storage.from('posts').remove([paths])` to avoid orphaned objects (both paths are cleaned up if either upload fails)

### Edge Functions

All Edge Functions are deployed with `verify_jwt: false` (pre-auth flows).

| Function | Purpose |
|---|---|
| `send-otp` | Receives `{ email, code }`, sends OTP email via Resend |
| `complete-signup` | Creates Supabase auth user via admin API (`email_confirm: true`) |

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

Installed via `npx expo install expo-linear-gradient` (SDK 55 compatible version `~55.0.9`).

---

## expo-blur

**Status: Active**

Used for the `GlobalSearchOverlay` frosted-glass background. `BlurView` with `intensity={35}` and theme-aware `tint` (`'dark'` / `'light'`) covers the full screen behind the search input and results list. The overlay is triggered by a pull-down gesture from `CameraScreen` in `VerticalNavigator`.

Installed as `~55.0.10`.

---

## react-native-gesture-handler + react-native-reanimated

**Status: Active** — `react-native-gesture-handler ~2.30.0`, `react-native-reanimated ~4.2.1`, `react-native-worklets 0.7.2`.

Two gesture systems coexist in the app — legacy RN `PanResponder` for full-screen navigators, and RNGH `Gesture.Pan` + Reanimated shared values for localised drag surfaces.

**PanResponder (legacy RN)** — used by `HorizontalNavigator` and `VerticalNavigator` for screen-to-screen paging. Each navigator uses `onMoveShouldSetPanResponder` with a **10px movement threshold** and axis-exclusive ownership (`Math.abs(dx) > Math.abs(dy)` for horizontal, inverse for vertical). The vertical navigator additionally gates downward swipes on `FeedScreen` (index 1) by the list's scroll-top state.

**RNGH `Gesture.Pan` + Reanimated** — used by three localised drag surfaces:

| Surface | File | Pattern |
|---|---|---|
| `CameraScreen` pip (inside `DualPhotoPreview` Modal) | `src/screens/CameraScreen.tsx` | Long-press activation (`activateAfterLongPress(150)`), bounds-clamp to screen corners, corner-snap spring on end, Tap-race for swap. Lives in its own `GestureHandlerRootView` because the Modal spawns a separate native window. |
| `FeedScreen` per-post pip | `src/screens/FeedScreen.tsx:142` | Same pattern as CameraScreen pip (long-press + corner-snap + Tap-race). Lives inside both navigators — proves RNGH coexists with the parent `PanResponder` stacks. |
| `StreakGridPanel` canvas | `src/components/StreakGridPanel.tsx` | Vertical-only pan inside a clipping viewport. No long-press (immediate drag), no snap, no spring-on-end — it's a map surface, not a widget. See `StreakGridPanel` notes in `architecture.md`. |

**Coexistence rule:** RNGH installs native gesture recognizers that dispatch **before** the JS responder system evaluates `PanResponder` thresholds. Because both navigators require 10px of movement before claiming a touch, RNGH has a free head-start and captures any touch landing inside a `GestureDetector` before the navigator's threshold is crossed. **No `simultaneousHandlers` or `waitFor` configuration is required.** The `FeedScreen` pip drag inside the navigator stack is the production-verified proof.

**Root wrapping** — `App.tsx` wraps the whole tree in `GestureHandlerRootView` (required by RNGH). Components that render inside native `<Modal>` windows (e.g. `CameraScreen`'s `DualPhotoPreview`, `ProfileMediaMapModal`) must wrap their own root because a Modal is a separate native window and the app-level root does not cross that boundary. Components that render as plain absolute overlays (e.g. `StreakGridPanel`) rely on the app-level root and do **not** need their own.

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
| `signup_completed` | `CreateAccountSheet.tsx` | Account created (includes `training_days`, `fitness_goals`) |

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
| Training days | `TrainingDaysScreen.tsx` | `captureException` on save failure; breadcrumbs for screen open, successful save |
| Follow | `UserProfileOverlay.tsx` | `captureMessage` on toggle follow/unfollow error; breadcrumb on follow tap |

**Pattern:** use `Sentry.captureException(err, { tags: { flow }, extra })` for caught errors and `Sentry.addBreadcrumb({ category, message, level })` for navigation/action events. Use `console.error('[ComponentName]')` alongside for dev debugging.

**Required env vars:**
```
EXPO_PUBLIC_SENTRY_DSN
EXPO_PUBLIC_APP_ENV   # 'development' | 'production' — Sentry only active in production
```
