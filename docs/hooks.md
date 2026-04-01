# Hooks

Custom hooks live in `src/hooks/`. They are thin wrappers over Zustand stores or library clients — they contain no local state of their own.

---

## `useAppTheme` — `src/hooks/useAppTheme.ts`

Resolves the effective colour scheme (light/dark) from the user's stored preference and the system setting.

```ts
import { useAppTheme } from '@/hooks/useAppTheme';

const { dark, colorScheme, colors } = useAppTheme();
```

**Return shape:**

| Field | Type | Description |
|---|---|---|
| `mode` | `'light' \| 'dark' \| 'system'` | Stored user preference |
| `colorScheme` | `'light' \| 'dark'` | Resolved effective scheme |
| `dark` | `boolean` | `true` when effective scheme is dark |
| `colors.bg` | `string` | `#1C1C19` (dark) / `#FFFFFF` (light) |
| `colors.text` | `string` | `#E8E8E3` (dark) / `#1A1A17` (light) |
| `colors.offWhite` | `string` | `#E8E8E3` |
| `colors.offBlack` | `string` | `#1A1A17` |

**Navigation usage:**
- `CameraScreen` uses `dark` to set shutter ring/fill colour and overlay text contrast
- `VerticalNavigator` uses `dark` to select background palette for off-screen placeholders
- `AppHeader` receives `isDark` as a prop (forced `true` on Camera — always dark background)
- `MessagesScreen` and `ProfileScreen` call `useAppTheme()` directly
- Use `dark` (boolean) rather than `colorScheme` (string) for contrast decisions

---

## `useProfilePosts` — `src/hooks/useProfilePosts.ts`

Thin wrapper over `useProfilePostsStore`. Triggers store sync on first mount for the given `userId`.

```ts
import { useProfilePosts } from '@/hooks/useProfilePosts';

const { posts, isLoading, hasMore, loadMore, refresh } = useProfilePosts(userId);
```

**Return shape:**

| Field | Type | Description |
|---|---|---|
| `posts` | `PostRow[]` | Posts for the viewed profile, newest first |
| `isLoading` | `boolean` | `true` only on true first-ever load |
| `hasMore` | `boolean` | Pagination state |
| `loadMore` | `() => void` | Append next page |
| `refresh` | `() => void` | Force re-fetch from page 1 |

`addPost` (called from `CameraScreen` after confirmed upload) deduplicates by UTC calendar day — the grid never shows two entries for the same day.

---

## `useFeed` — `src/hooks/useFeed.ts`

Thin wrapper over `useFeedStore`. Merges `pending` + `posts` into a single ordered list. Triggers store sync on first mount if the store is empty.

```ts
import { useFeed } from '@/hooks/useFeed';

const { posts, isLoading, hasMore, loadMore, refresh } = useFeed();
```

**Return shape:**

| Field | Type | Description |
|---|---|---|
| `posts` | `FeedPost[]` | `[...pending, ...confirmed]` — pending posts appear first |
| `isLoading` | `boolean` | `true` only on true first-ever load (`isSyncing && posts.length === 0`) |
| `hasMore` | `boolean` | `false` when last page had fewer rows than `PAGE_SIZE` |
| `loadMore` | `() => void` | Append next cursor page |
| `refresh` | `() => void` | Force re-fetch from page 1 |

Each `FeedPost` now includes `like_count: number`, `comment_count: number`, and `liked_by_me: boolean` — populated by the `get_feed_posts` RPC on initial load. These counts are kept live by `socialStore` writing back via `feedStore.patchPost` after each interaction or Realtime event.

**Zero-skeleton guarantee:** once the store has any data, `isLoading` is always `false` across re-mounts. `FeedScreen` never shows a skeleton after first load.

**`FeedScreen` props** (set by `VerticalNavigator`):
- `headerAnim?: Animated.Value` — scroll-driven value (0–`APP_HEADER_H`) that `VerticalNavigator` uses to translate the `AppHeader` off-screen on scroll-down
- `onScrollTopChange?: (atTop: boolean) => void` — fired when the list crosses `y <= 2`; used by `VerticalNavigator` to gate the swipe-back-to-camera gesture

**Double-tap gesture:** uses `Gesture.Tap().numberOfTaps(2).runOnJS(true)` — `.runOnJS(true)` is required so the callback runs on the JS thread where Zustand store references are accessible.

---

## `useMessages` — `src/hooks/useMessages.ts`

Thin wrapper over `useMessagesStore`. Triggers store sync on first mount if the store is empty.

```ts
import { useMessages } from '@/hooks/useMessages';

const { inbox, requests, isLoading, refresh, accept, send } = useMessages();
```

**Return shape:**

| Field | Type | Description |
|---|---|---|
| `inbox` | `ConversationPreview[]` | Accepted conversations |
| `requests` | `ConversationPreview[]` | Pending message requests |
| `isLoading` | `boolean` | `true` only on true first-ever load |
| `refresh` | `() => void` | Force re-fetch inbox + requests |
| `accept` | `(id: string) => Promise<void>` | Optimistically accept a request (via store) |
| `send` | `(convId, content) => Promise<MsgRow \| null>` | Send a message (direct API call) |

`accept` is fully optimistic — the request moves to inbox immediately; rolls back on API failure.

---

## `useSupabase` — `src/hooks/useSupabase.ts`

Returns the shared Supabase client singleton. Prefer this over importing `supabase` directly inside components.

```ts
import { useSupabase } from '@/hooks/useSupabase';

const supabase = useSupabase();
// supabase.from('table').select(...)
```

`App.tsx` uses the `supabase` singleton directly (not this hook) for the one-time auth subscription.

---

## Conventions

- Hooks are named `use<Feature>` and live in `src/hooks/`
- Hooks read from Zustand stores via selectors — no local `useState` for data that belongs in a store
- `isLoading` follows the pattern: `isSyncing && storeIsEmpty` — never `isSyncing` alone
- Trigger store actions via `useStore.getState().action()` to avoid stale closure issues
- `send` in `useMessages` is a direct API call (conversation detail is out of scope for the store layer)
