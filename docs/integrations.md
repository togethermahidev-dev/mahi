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
| `public.posts` | `id`, `user_id`, `image_url`, `pov_image_url`, `caption`, `streak_day`, `created_at` | `image_url` = rear/POV photo (default full-screen). `pov_image_url` = front selfie pip (nullable — null for legacy single-photo posts). Paginated cursor sort: `created_at DESC, id DESC`. Unique index `posts_user_day_unique` enforces one post per user per UTC day. RLS INSERT policy additionally blocks same-day inserts. |
| `public.post_likes` | `id`, `post_id`, `user_id`, `created_at` | Unique constraint `(post_id, user_id)`. RLS: authenticated read-all; insert/delete own only (`auth.uid() = user_id`). |
| `public.post_comments` | `id`, `post_id`, `user_id`, `content`, `created_at` | Ordered oldest-first. RLS: authenticated read-all; insert/delete own only. |
| `public.conversations` | `id`, `participant_one`, `participant_two`, `status`, `initiated_by`, `updated_at` | `participant_one < participant_two` enforced by `ordered_participants` CHECK constraint. `conversations_participants_unique` UNIQUE INDEX on `(participant_one, participant_two)` required for upsert `ON CONFLICT`. `REPLICA IDENTITY FULL` set for Realtime UPDATE/DELETE events. |
| `public.messages` | `id`, `conversation_id`, `sender_id`, `content`, `created_at` | Trigger updates `conversations.updated_at` on insert. `REPLICA IDENTITY FULL` set for Realtime. Immutable — no UPDATE or DELETE. |
| `public.streak_logs` | `id`, `user_id`, `streak_count`, `started_at`, `ended_at`, `is_active`, `created_at` | Audit log managed by `record_upload_streak` RPC — tracks active and closed streaks |

### Database Indexes

| Index | Table | Definition | Purpose |
|---|---|---|---|
| `posts_user_day_unique` | `public.posts` | `UNIQUE (user_id, ((created_at AT TIME ZONE 'UTC')::date))` | Enforces one post per user per UTC calendar day at the DB layer |
| `conversations_participants_unique` | `public.conversations` | `UNIQUE (participant_one, participant_two)` | Enables `ON CONFLICT (participant_one, participant_two)` upsert for `createOrGetConversation` |
| `convos_p1_idx` | `public.conversations` | `(participant_one, updated_at DESC)` | Fast fetch of conversations where user is participant_one, sorted by recency |
| `convos_p2_idx` | `public.conversations` | `(participant_two, updated_at DESC)` | Fast fetch of conversations where user is participant_two, sorted by recency |

### Database Functions

**`toggle_like(p_post_id uuid, p_user_id uuid)`** — `SECURITY DEFINER`
- Atomic like toggle. Inserts a like row; if a conflict occurs (already liked), deletes instead.
- Returns `{ liked: boolean, like_count: bigint }` — the final state after the operation.
- Called via `supabase.rpc('toggle_like', ...)` from `src/api/social.ts:toggleLike`.
- One round trip, no race condition, no need to check existing state first.

**`get_feed_posts(p_limit int, p_cursor_ts timestamptz, p_cursor_id uuid)`** — `SECURITY DEFINER STABLE`
- Replaces the old `posts` table select + `FEED_SELECT` constant.
- Returns enriched feed rows including `like_count`, `comment_count`, and `liked_by_me` (lateral join against `auth.uid()`).
- Cursor pagination: `p_cursor_ts` + `p_cursor_id` mirror the old `created_at DESC, id DESC` cursor. Both default to `null` for the first page.
- Called via `supabase.rpc('get_feed_posts', ...)` from `src/api/posts.ts:getFeedPosts`.

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

**Status: Active (available, not currently used in UI)**

Installed as `~55.0.10`. Available for future frosted-glass effects if needed.

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
