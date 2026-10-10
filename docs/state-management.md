# State Management

Mahi Fitness uses [Zustand](https://github.com/pmndrs/zustand) v5 for global client state. Stores live in `ui/src/store/` and are the **single event-ordering layer** between the UI and the backend.

## Architecture Pattern

```
User Action → Zustand Store (instant UI update) → API call (background) → confirm / rollback
```

Every store follows this contract:
- State updates are **synchronous and immediate** — no waiting for network
- API calls run after the store is already updated
- On API failure, the store rolls back to previous state
- `isLoading = isSyncing && storeIsEmpty` — the UI never shows a skeleton after first hydration
- **Nothing that expires or can be withdrawn is saved on the phone.** Feed items, lock state, open tags
  and invites live in memory only; a screen shows a loading state, then fresh server data (the feed's
  `loaded` flag means "this session's first page has arrived"). Only the theme and the mid-flow
  sign-up form persist.

---

## Stores

### `useAuthStore` — `ui/src/store/authStore.ts`

Manages Supabase authentication state.

| Field | Type | Description |
|---|---|---|
| `session` | `Session \| null` | Active Supabase session |
| `user` | `User \| null` | Derived from session |
| `isLoading` | `boolean` | `true` while session is being resolved (starts `true`) |

| Action | Description |
|---|---|
| `setSession(session)` | Sets session and auto-derives `user` |
| `setIsLoading(bool)` | Updates loading flag |
| `reset()` | Clears auth state on sign-out |

**Usage:**
```ts
const session   = useAuthStore((s) => s.session);
const isLoading = useAuthStore((s) => s.isLoading);
```

---

### `useUserStore` — `ui/src/store/userStore.ts`

Manages the authenticated user's profile including the Mahi points counters (stored as `streak_current` / `streak_highest` — see
[architecture.md](./architecture.md#reactive-posting)).

| Field | Type | Description |
|---|---|---|
| `profile` | `UserProfile \| null` | Full profile row from `public.profiles` |

| Action | Description |
|---|---|
| `setProfile(profile)` | Sets profile after DB fetch or optimistic update |
| `saveControls(patch)` | Settings → Security and privacy → Privacy controls: shows the change at once, calls `set_account_controls`, keeps the server's saved answer (private + Everyone is stored as Followers) and marks `privacy_chosen_at`; a refusal puts the old choice back. Sends `account_controls_changed`. |
| `reset()` | Clears profile on sign-out |

**UserProfile shape** (matches `profiles` table row):
```ts
{
  id: string;
  username: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  contact_number: string | null;
  fitness_goals: string[] | null;
  avatar_url: string | null;
  streak_current: number;           // Mahi points: +1 for the first post and each answering post (deleting a post takes its point back); back to 0 after a missed tag
  streak_highest: number;           // Best points, never lowered
  is_private?: boolean;             // Settings → Security and privacy → Privacy controls (missing from a server without them)
  posts_visibility?: 'everyone' | 'followers' | 'friends';
  tag_permission?: 'everyone' | 'approve' | 'friends';
  privacy_chosen_at?: string | null; // null until the public / private choice after sign-up
}
```

**Important — stale closure guard:** When writing back to the profile after an async upload, always read the current value from the store rather than a closure snapshot:
```ts
const current = useUserStore.getState().profile;
setProfile({ ...current, streak_current: streakResult.streak_current, ... });
```

**No training days or rest days.** Mahi points count your first post and posts that answer a tag (deleting a post takes its point back),
not days (there is no daily streak); the server keeps `streak_current` and `streak_highest` and the app only reads them.
`fitness_routine`, `streak_lowest` and `streak_last_upload_date` are gone (`20261001170000_drop_rest_days`).

**Usage:**
```ts
const profile    = useUserStore((s) => s.profile);
const setProfile = useUserStore((s) => s.setProfile);
```

---

### `useFeedStore` — `ui/src/store/feedStore.ts`

Manages the social feed (`get_feed`, server-gated by the feed lock) with optimistic post creation.

| Field | Type | Description |
|---|---|---|
| `posts` | `FeedPost[]` | Confirmed posts from backend (cursor-paginated) |
| `pending` | `PendingPost[]` | Optimistic local-only posts (shown immediately after camera tap) |
| `cursor` | `FeedCursor \| undefined` | Pagination cursor (last post's `{ts, id}`) |
| `hasMore` | `boolean` | `false` when backend returns fewer rows than `PAGE_SIZE` |
| `isSyncing` | `boolean` | `true` during any in-flight network call |
| `loaded` / `error` | `boolean` / `Error \| null` | This session's first page has arrived / the last read failed |
| `locked` / `unlockedUntil` / `serverOffsetMs` | | Feed lock state and the server-clock offset for "N hours left" |

| Action | Description |
|---|---|
| `sync(force?)` | Fetch first page. Skips if already syncing or loaded, unless `force`. A response from an older request is dropped. Tracks `feed_unlocked` when a sync finds the feed newly open. |
| `loadMore()` | Append next page using cursor. No-op if `!hasMore`. |
| `addPending(post)` | Prepend an optimistic post with a local `file://` URI |
| `confirmPending(tempId, real)` | Replace pending post with confirmed backend row |
| `removePending(tempId)` | Remove pending post on upload failure (rollback) |
| `patchPost(id, partial)` | Shallow-merge `partial` into the matching post. Used by `socialStore` to write back `like_count` / `comment_count` after RPC confirms. |
| `reset()` | Clear all state on sign-out |

**`PendingPost` type:**
```ts
export type PendingPost = FeedPost & { isPending: true };
// image_url and pov_image_url are local file:// URIs until upload confirms
```

`[...pending, ...posts]` — pending posts always appear first in the feed.

**Usage:**
```ts
const posts     = useFeedStore((s) => s.posts);
const isSyncing = useFeedStore((s) => s.isSyncing);

// Trigger actions via getState() outside React (e.g. App.tsx, CameraScreen)
useFeedStore.getState().sync();
useFeedStore.getState().addPending(post);
```

---

### `useSocialStore` — `ui/src/store/socialStore.ts`

Manages per-post likes and comments. Owns `likedByMe` booleans and comment arrays only — **never duplicates counts**. All `like_count` / `comment_count` mutations go through `feedStore.patchPost` so there is a single authoritative count per post.

| Field | Type | Description |
|---|---|---|
| `likedByMe` | `Record<string, boolean>` | Whether the current user has liked each post |
| `comments` | `Record<string, CommentWithProfile[]>` | Loaded comments per post (loaded lazily on tap) |
| `commentLikes` | `Record<string, { liked, count }>` | Comment likes by comment id (flag `comment-likes`; a comment's own count, not a post's) |
| `commentLikesReady` | `Record<string, boolean>` | By post: this opening's comment likes have arrived (the hearts show only then) |

| Action | Description |
|---|---|
| `initPost(postId, likedByMe)` | Seed liked state from the initial feed RPC result. Idempotent — skips if already set. |
| `toggleLike(postId, userId)` | Optimistic flip of `likedByMe` + `patchPost ±1 count`. Single RPC confirm. Rolls back on error. |
| `loadComments(postId)` | Fetch comments (oldest first) and cache. Idempotent — skips if already loaded. |
| `addComment(postId, userId, content, profile)` | Optimistic push with temp id, replace with confirmed row, `patchPost comment_count +1`. Rolls back on error. |
| `loadCommentLikes(postId)` | Read a post's comment likes fresh each time its comments open: not ready → fetch → ready. A failure leaves the hearts hidden. |
| `toggleCommentLike(commentId)` | Optimistic heart + count, then the server's answer; rolls back with a "Couldn't update like" toast. Ignores comments still being sent (`temp_` ids). |
| `getCommentLikers(commentId)` | Who liked a comment, straight from the server (`useCommentLikers` holds it while the list is open); never stored. |
| `subscribeToPost(postId)` | Open a Supabase Realtime channel for the post. Ref-counted — safe to call multiple times per post. |
| `unsubscribeFromPost(postId)` | Decrement ref count. Channel destroyed only when count reaches 0. |
| `reset()` | Remove all channels and clear state on sign-out. |

**Cross-store pattern:** `socialStore` calls `useFeedStore.getState().patchPost(id, partial)` to write confirmed counts back to `feedStore`. Counts live on `FeedPost` objects; `socialStore` never stores them.

**Realtime subscriptions** are managed at the `FeedScreen` level via `onViewableItemsChanged` — only posts currently visible in the viewport maintain open channels (~3–5 max). `PostItem` itself has no subscription logic.

**Usage:**
```ts
const likedByMe = useSocialStore((s) => s.likedByMe[postId] ?? false);
const comments  = useSocialStore((s) => s.comments[postId]);

// Actions via getState() in event handlers to avoid stale closures
useSocialStore.getState().toggleLike(postId, userId);
useSocialStore.getState().addComment(postId, userId, text, profile);
```

---

### `useFollowStore` — `ui/src/store/followStore.ts`

Manages follow relationships between users. Owns follow status booleans and follower/following counts per user. Uses a single RPC (`get_follow_data`) to load all data in one query.

| Field | Type | Description |
|---|---|---|
| `followingByMe` | `Record<string, boolean>` | Whether the current user follows each target user (keyed by target userId) |
| `followsMe` | `Record<string, boolean>` | Whether each user follows the current user ("Follow back") |
| `requestedByMe` | `Record<string, boolean>` | My follow request to a private account is waiting ("Requested") |
| `privateById` | `Record<string, boolean>` | The account is private, as the server last said |
| `counts` | `Record<string, { follower_count, following_count }>` | Follower and following counts per user |

| Action | Description |
|---|---|
| `loadFollowData(currentUserId, targetUserId)` | Fetch follow status, `requested`, `is_private` and counts via single `get_follow_data` RPC (the server ignores the first id and uses the signed-in account). Called when a profile overlay opens or own profile mounts. |
| `toggleFollow(currentUserId, targetUserId)` | The follow button: Follow / Follow back follows, Following unfollows, Requested takes the request back (`setFollow` underneath). |
| `setFollow(currentUserId, targetUserId, follow)` | Optimistic: a known private target shows Requested at once and moves no count; otherwise Following and both loaded counts move. Calls the atomic `set_following` RPC and reconciles from its committed `status` (`following` \| `requested` \| `none`), `is_private` and counts. Rolls back on error. Returns `{ error, status }`. Sends `user_followed` / `follow_requested` / `user_unfollowed` / `follow_request_cancelled` only for a real change. |
| `removeFollower(currentUserId, followerId)` | Optimistic: drops `followsMe` and my follower count, calls `remove_follower`, puts them back on error. Sends `follower_removed`. |
| `reset()` | Clear all state on sign-out. |

The Requested state ships with no switch: from 20261008170000_private_accounts the server may
answer `requested` to any follow.

**Cross-store pattern:** Unlike `socialStore` which writes counts to `feedStore`, `followStore` owns its own counts — they are independent of feed data. When toggling follow, the store optimistically updates both the target user's `follower_count` and the current user's `following_count` (if loaded), then replaces the prediction with the server's committed answer. Its realtime channel registry fans one database event out to every mounted subscriber, so a profile and an open friends list cannot hide each other's refresh.

Friends/follow lists are expiring social data: `FollowListModal` fetches them from the server on open,
shows loading first, and listens for follow changes while visible. Do not persist these rows locally.
A claimed tag invite on a post creates both directional rows on the server; a mate invite from a
private account creates the inviter's row and a follow request for the claimer. Accepting a tag
request no longer creates follows (owner, 2026-10-08): the app then offers Follow back / Accept their
follow. Those flows refresh through realtime rather than fabricating list rows.

**Usage:**
```ts
const isFollowing    = useFollowStore((s) => s.followingByMe[userId] ?? false);
const followerCount  = useFollowStore((s) => s.counts[userId]?.follower_count ?? 0);
const followingCount = useFollowStore((s) => s.counts[userId]?.following_count ?? 0);

// Load data when profile opens
useFollowStore.getState().loadFollowData(currentUserId, targetUserId);

// Toggle in event handler
const { error } = await useFollowStore.getState().toggleFollow(currentUserId, targetUserId);
```

---

### `useFollowRequestStore` — `ui/src/store/followRequestStore.ts`

Follow requests to my private account (switch `private-accounts`). Requests can be taken back, so
the list is memory only and never kept on the phone.

| Field | Type | Description |
|---|---|---|
| `requests` | `FollowRequest[] \| null` | Incoming requests, newest first; `null` = not read since the last `clear` (show a loading state) |
| `failed` | `boolean` | The last read failed |

| Action | Description |
|---|---|
| `load()` | Fresh read through `get_follow_requests` |
| `clear()` | Forget the list, so an opening screen shows a loading state, never old rows |
| `respond(currentUserId, requesterId, accept, followBack?)` | Optimistic: the row goes at once, comes back in place on error. Calls `respond_follow_request`; a Confirm marks them as my follower in `followStore` (documented cross-store effect), a follow back shows the server's answer on their button. Sends `follow_request_answered`. |
| `subscribe(userId)` | Live while open: INSERT filtered to `target_id`, DELETE unfiltered (Supabase can't filter deletes), each re-reads. Module-level ref-counted registry, like `subscribeToFollows`. |
| `reset()` | Close channels and forget the list on sign-out (wired in `App.tsx`). |

`useFollowRequests(active)` is the thin hook: clear, load and subscribe while a screen showing the
list is open.

---

### `useProfilePostsStore` — `ui/src/store/profilePostsStore.ts`

Manages the post grid shown on `ProfileScreen`. Separate from `useFeedStore` — scoped to the currently viewed profile.

| Field | Type | Description |
|---|---|---|
| `posts` | `PostRow[]` | Posts for the viewed profile, newest first |
| `hasMore` | `boolean` | Pagination state |
| `isSyncing` | `boolean` | `true` during fetch |
| `restricted` | `'private' \| 'followers' \| 'friends' \| null` | Their Controls hide their workouts from you (`get_user_posts`' `restricted`); the profile shows why at the top, above any posts it still carries (ones you're tagged on) |

| Action | Description |
|---|---|
| `sync(userId)` | Fetch first page (30 posts) for the given profile |
| `loadMore(userId)` | Append next page |
| `addPost(post)` | Prepend a newly uploaded post; deduplicates by post id — a retry of the same post replaces it (no daily limit) |
| `reset()` | Clear on sign-out |

**Usage:**
```ts
// In CameraScreen after confirmed upload — no refetch needed
useProfilePostsStore.getState().addPost(postData);
```

---

### `useMessagesStore` — `ui/src/store/messagesStore.ts`

Manages conversation inbox, message requests, and real-time inbox subscriptions.

| Field | Type | Description |
|---|---|---|
| `inbox` | `ConversationPreview[]` | Accepted conversations (status = `'active'`) |
| `requests` | `ConversationPreview[]` | Pending conversation requests (status = `'requested'`) |
| `isSyncing` | `boolean` | `true` during network calls |

| Action | Description |
|---|---|
| `sync()` | Parallel fetch of inbox + requests. Guards against concurrent calls. |
| `accept(conversationId)` | Optimistically move request → inbox; rolls back on API failure. |
| `deny(conversationId)` | Optimistically remove from requests and delete the conversation; rolls back on failure. |
| `patchConversationLastMessage(conversationId, msg)` | Update the `last_message` preview and `updated_at` for a conversation in both `inbox` and `requests`. Called after every send/receive. |
| `clearUnread(conversationId)` | Zero a conversation's unread count when it is read. |
| `subscribeToInbox(userId)` | Open two Supabase Realtime channels (one filtered by `participant_one`, one by `participant_two`) to receive new conversations and status updates in real-time. Idempotent — no-op if already subscribed. |
| `unsubscribeFromInbox(userId)` | Tear down both inbox channels. |
| `reset()` | Close all channels and clear all state on sign-out. |

**Two-channel inbox subscription pattern:** `postgres_changes` bypasses RLS at the WAL level, so a single unfiltered channel would transmit all conversation rows to every client. The store instead opens two filtered channels per user — `inbox_p1:{userId}` (filter: `participant_one=eq.{userId}`) and `inbox_p2:{userId}` (filter: `participant_two=eq.{userId}`) — so only rows where the user is a participant cross the wire.

**Usage:**
```ts
const inbox    = useMessagesStore((s) => s.inbox);
const requests = useMessagesStore((s) => s.requests);

useMessagesStore.getState().sync();
useMessagesStore.getState().accept(conversationId);
useMessagesStore.getState().deny(conversationId);
useMessagesStore.getState().patchConversationLastMessage(conversationId, msg);
```

Prefer using `useMessages()` in components — it wraps the store and manages the subscription lifecycle automatically.

---

### `useSignUpStore` — `ui/src/store/signUpStore.ts`

Persists sign-up form state across app backgrounding mid-flow. Cleared on completion or sign-out.

---

### Other stores

| Store | File | Owns |
|---|---|---|
| `useConversationStore` | `conversationStore.ts` | Open threads: messages, paging older, `send` through `send_message`, `markRead`; channel registry outside state; re-reads the newest page after a reconnect |
| `useNotificationsStore` | `notificationsStore.ts` | Activity items, `unreadCount`, realtime `subscribe`/`unsubscribe`, `markRead`/`markAllRead`; tracks `tag_missed` and `streak_lost` as they arrive |
| `useSuggestStore` | `suggestStore.ts` | "Suggested for you" list, `followSuggested` |
| `useBlockStore` | `blockStore.ts` | Blocked ids both ways (`isBlocked`), `block`/`unblock`; refreshes feed, messages and follows |
| `usePushStore` | `pushStore.ts` | Whether this device's push token is registered, what the phone says about notifications, and whether the "turn on notifications" page has been answered on this device |
| `useTagStore` | `tagStore.ts` | Open tags (memory only, they expire), `serverOffsetMs`, `openTagsLoaded`, `requiredTags`/`maxTags` from `app_config` |
| `useInviteStore` | `inviteStore.ts` | The invite token/code the app was opened with (memory only) and its claim |
| `useToastStore` | `toastStore.ts` | One toast message for failed mutations (imported directly, not from the barrel) |
| `useChromeStore` | `chromeStore.ts` | What floats over the pages: `covers` (full-screen views open over a page, so the glass bar hides — someone's profile, search) and `viewing` (a post is held: hold to view) |

---

### `useThemeStore` — `ui/src/store/themeStore.ts`

Persists the user's colour scheme preference (`'light' | 'dark'`). Rehydrated at cold start via `rehydrateTheme()` which reads `@mahi/theme_mode` from `AsyncStorage` and calls `setMode()`. Exposes `setMode(mode)`, `cycleMode()` (toggles between light and dark), and `reset()` (returns to `'light'` default). The `ThemeMode` type is re-exported from `ui/src/store/index.ts` as a type alias for consumers.

---

## Barrel Export

All stores and relevant types are exported from `ui/src/store/index.ts`:

```ts
import {
  useAuthStore,
  useUserStore,
  useSignUpStore,
  useThemeStore,
  useFeedStore,
  useMessagesStore,
  useConversationStore,
  useNotificationsStore,
  useProfilePostsStore,
  useSocialStore,
  useFollowStore,
  useSuggestStore,
  useBlockStore,
  usePushStore,
  useTagStore,
  useInviteStore,
} from '@/store';

import type { PendingPost, ThemeMode, Thread } from '@/store';
```

---

## Hydration — `App.tsx`

After `onAuthStateChange` fires with a valid session, `App.tsx` (`hydrateForUser`) loads the profile and fires non-blocking background syncs:

```ts
useFeedStore.getState().sync();
useMessagesStore.getState().sync();
useNotificationsStore.getState().sync(userId);
useBlockStore.getState().sync(userId);
```

This means by the time the user navigates to FeedScreen or MessagesScreen, data is already in the stores — zero loading skeletons.

On sign-out, the following stores are reset in `App.tsx`:

```ts
useUserStore, useFeedStore, useMessagesStore, useConversationStore, useNotificationsStore,
useProfilePostsStore, useFollowStore, useSuggestStore, useBlockStore, useSocialStore,
usePushStore, useTagStore, useInviteStore  // .getState().reset() each
posthog.reset();  // also clears feature flags
```

A new store's `reset()` goes into this list in the same commit.

---

## Conventions

- Always use selectors to avoid unnecessary re-renders: `useFeedStore((s) => s.posts)`
- Call `reset()` on all stores on sign-out (handled in `App.tsx`)
- Outside React components (App.tsx, event handlers), access state via `useStore.getState()`
- `isLoading` guard: `isSyncing && storeIsEmpty` — never show a skeleton after first hydration
- `isSyncing` alone does not block interaction — it is only used for the `isLoading` guard
