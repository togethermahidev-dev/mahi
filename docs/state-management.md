# State Management

Mahi Fitness uses [Zustand](https://github.com/pmndrs/zustand) v5 for global client state. Stores live in `src/store/` and are the **single event-ordering layer** between the UI and the backend.

## Architecture Pattern

```
User Action → Zustand Store (instant UI update) → API call (background) → confirm / rollback
```

Every store follows this contract:
- State updates are **synchronous and immediate** — no waiting for network
- API calls run after the store is already updated
- On API failure, the store rolls back to previous state
- `isLoading = isSyncing && storeIsEmpty` — the UI never shows a skeleton after first hydration

---

## Stores

### `useAuthStore` — `src/store/authStore.ts`

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

### `useUserStore` — `src/store/userStore.ts`

Manages the authenticated user's profile including streak counters.

| Field | Type | Description |
|---|---|---|
| `profile` | `UserProfile \| null` | Full profile row from `public.profiles` |

| Action | Description |
|---|---|
| `setProfile(profile)` | Sets profile after DB fetch or optimistic update |
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
  fitness_routine: string | null;   // comma-separated 3-letter day abbrevs e.g. 'Mon,Wed,Fri'
  avatar_url: string | null;
  streak_current: number;
  streak_highest: number;
  streak_lowest: number | null;
  streak_last_upload_date: string | null;  // YYYY-MM-DD local date
}
```

**Important — stale closure guard:** When writing back to the profile after an async upload, always read the current value from the store rather than a closure snapshot:
```ts
const current = useUserStore.getState().profile;
setProfile({ ...current, streak_current: streakResult.streak_current, ... });
```

**Usage:**
```ts
const profile    = useUserStore((s) => s.profile);
const setProfile = useUserStore((s) => s.setProfile);
```

---

### `useFeedStore` — `src/store/feedStore.ts`

Manages the social feed with optimistic post creation.

| Field | Type | Description |
|---|---|---|
| `posts` | `FeedPost[]` | Confirmed posts from backend (cursor-paginated) |
| `pending` | `PendingPost[]` | Optimistic local-only posts (shown immediately after camera tap) |
| `cursor` | `FeedCursor \| undefined` | Pagination cursor (last post's `{ts, id}`) |
| `hasMore` | `boolean` | `false` when backend returns fewer rows than `PAGE_SIZE` |
| `isSyncing` | `boolean` | `true` during any in-flight network call |

| Action | Description |
|---|---|
| `sync(force?)` | Fetch first page. Skips if `posts.length > 0 && !force`. Guard against concurrent calls. |
| `loadMore()` | Append next page using cursor. No-op if `!hasMore`. |
| `addPending(post)` | Prepend an optimistic post with a local `file://` URI |
| `confirmPending(tempId, real)` | Replace pending post with confirmed backend row |
| `removePending(tempId)` | Remove pending post on upload failure (rollback) |
| `reset()` | Clear all state on sign-out |

**`PendingPost` type:**
```ts
export type PendingPost = FeedPost & { isPending: true };
// image_url is a local file:// URI until upload confirms
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

### `useProfilePostsStore` — `src/store/profilePostsStore.ts`

Manages the post grid shown on `ProfileScreen`. Separate from `useFeedStore` — scoped to the currently viewed profile.

| Field | Type | Description |
|---|---|---|
| `posts` | `PostRow[]` | Posts for the viewed profile, newest first |
| `hasMore` | `boolean` | Pagination state |
| `isSyncing` | `boolean` | `true` during fetch |

| Action | Description |
|---|---|
| `sync(userId)` | Fetch first page (30 posts) for the given profile |
| `loadMore(userId)` | Append next page |
| `addPost(post)` | Prepend a newly uploaded post (called from `CameraScreen` on upload confirm) |
| `reset()` | Clear on sign-out |

**Usage:**
```ts
// In CameraScreen after confirmed upload — no refetch needed
useProfilePostsStore.getState().addPost(postData);
```

---

### `useMessagesStore` — `src/store/messagesStore.ts`

Manages conversation inbox and message requests with optimistic accept.

| Field | Type | Description |
|---|---|---|
| `inbox` | `ConversationPreview[]` | Accepted conversations (status = `'active'`) |
| `requests` | `ConversationPreview[]` | Pending conversation requests (status = `'requested'`) |
| `isSyncing` | `boolean` | `true` during network calls |

| Action | Description |
|---|---|
| `sync(userId)` | Parallel fetch of inbox + requests. Guard against concurrent calls. |
| `accept(conversationId)` | Optimistically move request → inbox; rolls back on API failure |
| `reset()` | Clear all state on sign-out |

**Usage:**
```ts
const inbox    = useMessagesStore((s) => s.inbox);
const requests = useMessagesStore((s) => s.requests);

useMessagesStore.getState().sync(userId);
useMessagesStore.getState().accept(conversationId);
```

---

### `useSignUpStore` — `src/store/signUpStore.ts`

Persists sign-up form state across app backgrounding mid-flow. Cleared on completion or sign-out.

---

### `useThemeStore` — `src/store/themeStore.ts`

Persists the user's colour scheme preference (`'light' | 'dark' | 'system'`). Rehydrated at cold start via `rehydrateTheme()`.

---

## Barrel Export

All stores and relevant types are exported from `src/store/index.ts`:

```ts
import {
  useAuthStore,
  useUserStore,
  useSignUpStore,
  useThemeStore,
  useFeedStore,
  useMessagesStore,
  useProfilePostsStore,
} from '@/store';

import type { PendingPost } from '@/store';
```

---

## Hydration — `App.tsx`

After `onAuthStateChange` fires with a valid session, `App.tsx` fires non-blocking background syncs:

```ts
useFeedStore.getState().sync();
useMessagesStore.getState().sync(userId);
```

This means by the time the user navigates to FeedScreen or MessagesScreen, data is already in the stores — zero loading skeletons.

On sign-out, all stores are reset:

```ts
useUserStore.getState().reset();
useFeedStore.getState().reset();
useMessagesStore.getState().reset();
```

---

## Conventions

- Always use selectors to avoid unnecessary re-renders: `useFeedStore((s) => s.posts)`
- Call `reset()` on all stores on sign-out (handled in `App.tsx`)
- Outside React components (App.tsx, event handlers), access state via `useStore.getState()`
- `isLoading` guard: `isSyncing && storeIsEmpty` — never show a skeleton after first hydration
- `isSyncing` alone does not block interaction — it is only used for the `isLoading` guard
