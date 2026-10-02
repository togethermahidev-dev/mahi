# Hooks

Custom hooks live in `src/hooks/`. They are thin wrappers over Zustand stores or library clients — they contain no local state of their own.

---

## `useAppTheme` — `src/hooks/useAppTheme.ts`

Reads the user's stored colour scheme preference from `useThemeStore` and exposes it as a flat theme object. The hook does not consult the OS `useColorScheme()` — the app has an explicit light/dark preference only (no `'system'` mode).

```ts
import { useAppTheme } from '@/hooks/useAppTheme';

const { dark, colorScheme, colors } = useAppTheme();
```

**Return shape:**

| Field | Type | Description |
|---|---|---|
| `mode` | `'light' \| 'dark'` | Stored user preference (same value as `colorScheme`) |
| `colorScheme` | `'light' \| 'dark'` | Resolved effective scheme |
| `dark` | `boolean` | `true` when effective scheme is dark |
| `colors.bg` | `string` | `#1C1C19` (dark) / `#FFFFFF` (light) |
| `colors.text` | `string` | `#E8E8E3` (dark) / `#1A1A17` (light) |
| `colors.offWhite` | `string` | `#E8E8E3` |
| `colors.offBlack` | `string` | `#1A1A17` |
| `colors.accent` | `string` | Brand cyan (`COLORS.accent`) |
| `colors.glassOnDark` / `colors.glassOnLight` | `string` | Frosted fill where real glass/blur isn't available |
| `navRail` | `{ width, edgeGap, gap }` | Nav rail geometry from tokens |

All values come from `src/constants/tokens.ts`; anything not here, import from tokens directly.

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

`addPost` (called from `CameraScreen` after confirmed upload) deduplicates by post id — a retry of the same post replaces it; there is no daily limit.

---

## `useRailRoom`, `useCoverRail`, `useChromeFade` — `src/hooks/useChrome.ts`

The glass bar (nav rail) floats on the **left** edge of the Camera, vertically centred. It is on no
other screen (`railShows` in `src/lib/railSelector.ts`).
- `useRailRoom()` — the room it takes on the Camera's left (safe inset + `edgeGap` + `width` + `SPACE.s8`),
  0 when `nav-glass-rail` is off. Used by the camera's photo-in-photo guide; no other screen keeps room.
- `useCoverRail(open)` — while `open`, the bar hides (`chromeStore.covers`): `UserProfileScreen`,
  `GlobalSearchOverlay`.
- `useChromeFade()` — `{ viewing, style }`: an opacity that fades out while a post is held (hold to view).

---

## `useFeed` — `src/hooks/useFeed.ts`

```ts
const { posts, isLoading, error, hasMore, locked, unlockedUntil, serverOffsetMs, loaded, loadMore, refresh } = useFeed();
```

Reads `feedStore` (server-gated `get_feed`). Syncs once per session on mount, again whenever the app
returns to the foreground, and when the 24-hour unlock ends (timer on the server clock).
`isLoading` is true until this session's first page arrives, so last session's posts never flash.
`locked` = friends' posts are hidden until the user posts; hidden items have `locked: true`.
`unlockedUntil` + `serverOffsetMs` drive `FeedLockBanner`'s "N hours left" (wording in `src/lib/feedLock.ts`).

| Field | Type | Description |
|---|---|---|
| `posts` | `FeedPost[]` | `[...pending, ...confirmed]` — pending posts appear first |
| `isLoading` | `boolean` | `!loaded && posts.length === 0` |
| `hasMore` | `boolean` | `false` when last page had fewer rows than `PAGE_SIZE` |
| `loadMore` | `() => void` | Append next cursor page |
| `refresh` | `() => void` | Force re-fetch from page 1 |

Each `FeedPost` includes `like_count: number`, `comment_count: number`, `liked_by_me: boolean`, and `tagged_users: TaggedUser[]` — all populated by `get_feed`. Counts are kept live by `socialStore` writing back via `feedStore.patchPost` after each interaction or Realtime event. `tagged_users` is always a (possibly empty) array because the SQL coalesces the aggregation — the client never has to handle `null`. See `docs/architecture.md#caption--tagging` and `docs/integrations.md#database-functions` for the full tagging contract.

**Zero-skeleton guarantee:** once the store has any data, `isLoading` is always `false` across re-mounts. `FeedScreen` never shows a skeleton after first load.

**`FeedScreen` props** (set by `VerticalNavigator`):
- `headerAnim?: Animated.Value` — scroll-driven value (0–header height) that `VerticalNavigator` uses to translate the `AppHeader` off-screen on scroll-down
- `listGesture` — the shared `feedList` `Gesture.Native()` wrapping the list's scrolling, so the page swipes can run alongside it; `listOffset` — the list's scroll offset on the UI thread, for the top-of-list rule (see [integrations.md](./integrations.md#react-native-gesture-handler--react-native-reanimated))
- `onGoToCamera` (the locked-feed card's button) and `onOverlayChange` (a pop-up is open, so the pages must not move)

**Double-tap gesture:** uses `Gesture.Tap().numberOfTaps(2).runOnJS(true)` — `.runOnJS(true)` is required so the callback runs on the JS thread where Zustand store references are accessible.

---

## `useMessages` — `src/hooks/useMessages.ts`

Thin wrapper over `useMessagesStore`. Triggers store sync and inbox real-time subscription on first mount.

```ts
import { useMessages } from '@/hooks/useMessages';

const { inbox, requests, isLoading, refresh, accept, deny, send, startConversation } = useMessages();
// send(conversationId, content) goes through useConversationStore (send_message) and returns a boolean
```

**Return shape:**

| Field | Type | Description |
|---|---|---|
| `inbox` | `ConversationPreview[]` | Accepted conversations |
| `requests` | `ConversationPreview[]` | Pending message requests |
| `isLoading` | `boolean` | `true` only on true first-ever load |
| `refresh` | `() => void` | Force re-fetch inbox + requests |
| `accept` | `(id: string) => Promise<void>` | Optimistically accept a request — moves to inbox immediately, rolls back on API failure |
| `deny` | `(id: string) => Promise<void>` | Optimistically remove a request — deletes the conversation, rolls back on failure |
| `send` | `(convId, content) => Promise<boolean>` | Send through `useConversationStore.send` |
| `startConversation` | `(otherUserId: string) => Promise<ConversationPreview \| null>` | Create or retrieve an existing conversation — upserts via `createOrGetConversation`, injects result into the store |

The `useEffect` inside `useMessages` also calls `subscribeToInbox(userId)` and unsubscribes on cleanup — so any component mounting this hook gets live inbox updates for free.

---

## `useConversation` — `src/hooks/useConversation.ts`

Manages the full state for a single open conversation thread. Used exclusively by `ConversationScreen`.

```ts
import { useConversation } from '@/hooks/useConversation';

const { messages, isLoading, isLoadingOlder, hasMore, send, loadOlder, markRead } = useConversation(conversationId);
```

Thin wrapper over `useConversationStore` (`open` on mount, `close` on unmount).

| Field | Type | Description |
|---|---|---|
| `messages` | `Message[]` | The thread's loaded messages |
| `isLoading` / `isLoadingOlder` / `hasMore` | `boolean` | First page / older page loading; more history exists |
| `send` | `(content: string) => Promise<boolean>` | Optimistic send through `send_message` |
| `loadOlder` | `() => void` | Page in older messages |
| `markRead` | `() => void` | Mark the thread read (`mark_conversation_read`) |

**Real-time:** the store keeps one channel per open thread (registry outside state) and re-reads the newest page after a reconnect, since a reconnect may have missed messages.

**Preview sync:** every confirmed message (both sent and received via real-time) calls `useMessagesStore.getState().patchConversationLastMessage(conversationId, msg)` so the `ConvoRow` preview in `MessagesScreen` stays current without a full re-sync.

---

## `usePushRegistration` — `src/hooks/usePushRegistration.ts`

Mounted once in `VerticalNavigator`. When signed in: registers this device's push token through
`usePushStore.register()` if permission is already granted; otherwise, once per device and only while
the `push-core` flag is on, shows an explainer alert and then the OS prompt
(`usePushStore.requestAndRegister()`). Re-registers when the OS rotates the token. Sign-out
unregisters the token in `api/auth.ts signOut()` before the session ends.

---

## `usePushRouting` — `src/hooks/usePushRouting.ts`

```ts
usePushRouting({ openProfile: (userId) => …, openNotifications: () => … });
```

Handles a tapped push (including the one that launched the app): marks its notification read, then
opens the actor's profile for follows or the notifications list for everything else.

---

## `useOpenTags` — `src/hooks/useOpenTags.ts`

```ts
const { openTags, serverOffsetMs, isLoading, refresh } = useOpenTags();
```

Tags waiting for the user's post (`get_open_tags`), kept in `tagStore` memory only (they expire).
Syncs on mount and whenever the app returns to the foreground. `serverOffsetMs` lets countdowns
(`src/lib/countdown.ts`) run on the server's clock. Used by `CameraScreen` for `OpenTagsBanner` and by
`FeedLockBanner` (who tagged you).

---

## `useFeatureFlag` — `src/hooks/useFeatureFlag.ts`

```ts
const on = useFeatureFlag('nav-rail-morph');
```

Reads one PostHog flag (keys typed in `src/lib/featureFlags.ts`). On while flags are loading or analytics
is off; a key missing from PostHog reads as off once flags load. See [feature-flags.md](./feature-flags.md).

---

## `useNotifications` — `src/hooks/useNotifications.ts`

```ts
const { items, unreadCount, isLoading, refresh, markRead, markAllRead } = useNotifications();
```

Thin wrapper over `useNotificationsStore` that owns the realtime subscription lifecycle — the template
for a hook with a subscription ([adding-a-feature.md](./adding-a-feature.md)).

---

## `useSuggestedFollows` — `src/hooks/useSuggestedFollows.ts`

`{ suggestions, isLoading, refresh, follow }` over `useSuggestStore`; syncs on mount if not loaded.

---

## `useInviteLink` — `src/hooks/useInviteLink.ts`

Mounted once in `App.tsx`. Takes an invite link that opened the app (cold or warm) into `inviteStore`
(memory only) and claims it once someone is signed in.

---

## `useMinuteTick` — `src/hooks/useMinuteTick.ts`

Device time refreshed every minute, so countdown text ("41 hours left") re-renders on its own.

---

## Conventions

- Hooks are named `use<Feature>` and live in `src/hooks/`
- Hooks read from Zustand stores via selectors — no local `useState` for data that belongs in a store
- `isLoading` follows the pattern: `isSyncing && storeIsEmpty` — never `isSyncing` alone
- Trigger store actions via `useStore.getState().action()` to avoid stale closure issues
- Message state for a thread lives in `useConversationStore`; `useMessages().send` and `useConversation().send` both go through it
- Real-time subscriptions that span multiple components (inbox) live in a hook `useEffect`; subscriptions scoped to a single screen (conversation thread) live in the hook for that screen (`useConversation`)
