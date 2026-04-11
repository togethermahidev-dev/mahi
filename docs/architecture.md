# Mahi Fitness — Architecture

## Overview

Mahi Fitness is a React Native fitness application built with Expo. Users take a daily streak photo from the Camera screen; that photo appears in a social Feed. The app has a messaging system (inbox + requests) and a profile view with streak stats. Backend is Supabase (auth, database, storage). State is managed with Zustand using an optimistic-UI-first pattern.

## Tech Stack

| Layer | Tool | Version |
|---|---|---|
| Framework | Expo (React Native) | ~55.0.8 |
| Language | TypeScript (strict) | ~5.9.2 |
| Backend / Auth | Supabase | ^2.96.0 |
| State Management | Zustand | ^5.0.11 |
| Session Storage | AsyncStorage | ^2.2.0 |
| List Rendering | @shopify/flash-list | — |
| Gestures | react-native-gesture-handler | ~2.30.0 |
| UI Animation | react-native-reanimated | ~4.2.1 |
| Gradients | expo-linear-gradient | ~55.0.9 |
| Blur | expo-blur | ~55.0.10 |
| Analytics | PostHog | ^4.35.0 |
| Error Tracking | Sentry | ^8.0.0 |

---

## Project Structure

```
mahi-fitness/
├── src/
│   ├── api/            # Supabase query functions (posts, messages, profile, streaks, auth)
│   ├── lib/            # Singleton clients (Supabase, PostHog, Sentry)
│   ├── store/          # Zustand global state (feedStore, messagesStore, authStore, userStore, …)
│   ├── hooks/          # Thin store wrappers + utility hooks (useMessages, useConversation, …)
│   ├── types/          # TypeScript types — database.ts is the source of truth for DB shapes
│   ├── components/     # Shared UI components (AppHeader, NavigationDots, ThemeToggle, UserProfileOverlay, GlobalSearchOverlay, AvatarPicker, TrainingDaysScreen, StreakGridPanel, CaptionText, TaggedBubbleStack)
│   └── screens/        # Screen-level components (including ConversationScreen)
├── docs/               # Project documentation
├── assets/             # Images, icons, splash
├── App.tsx             # Root component — auth subscription + store hydration
├── index.ts            # Entry point (registerRootComponent)
└── app.config.js       # Expo config (dynamic)
```

---

## Data Flow

The Zustand stores are the **single event-ordering layer** between the UI and Supabase.

```
User Action
    │
    ▼
Zustand Store  ←── instant synchronous update (UI responds immediately)
    │
    ▼ (background)
Supabase API   ←── network call fires after store is updated
    │
    ▼
Store confirm / rollback
```

`App.tsx` hydrates feed and messages stores immediately after auth — screens have data before they mount.

```
onAuthStateChange (session found)
    │
    ├── getProfile(userId)              → useUserStore.setProfile()
    ├── useFeedStore.sync()             → background, non-blocking
    └── useMessagesStore.sync(userId)   → background, non-blocking

useMessages() mount (MessagesScreen)
    │
    └── useMessagesStore.subscribeToInbox(userId)
            ├── channel inbox_p1:{userId}  → participant_one=eq.{userId}
            └── channel inbox_p2:{userId}  → participant_two=eq.{userId}

useConversation(conversationId) mount (ConversationScreen)
    │
    └── channel convo:{conversationId}  → conversation_id=eq.{conversationId}
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `public.profiles` | User profile — display name, avatar, streak counters |
| `public.posts` | Daily streak photos — one per user per day. `image_url` = rear/POV photo; `pov_image_url` = front selfie (nullable — null on legacy single-photo posts). Enforced by unique index `posts_user_day_unique (user_id, (created_at AT TIME ZONE 'UTC')::date)` and RLS INSERT policy |
| `public.post_likes` | One row per user-post like. Unique constraint `(post_id, user_id)`. RLS: authenticated read-all, insert/delete own only. |
| `public.post_comments` | Comments on posts. Ordered oldest-first. RLS: authenticated read-all, insert/delete own only. |
| `public.follows` | Follow relationships. Unique constraint `(follower_id, following_id)`, self-follow check constraint. RLS: authenticated read-all, insert/delete own only (`auth.uid() = follower_id`). Explicit UPDATE deny policy. |
| `public.post_tags` | User-tag junction table: which users were mentioned on which post. Composite PK `(post_id, user_id)`. RLS: authenticated read-all, insert only when the caller owns the referenced post. Aggregated into `tagged_users` by the `get_feed_posts` RPC. |
| `public.conversations` | Messaging thread — one row per pair, ordered participants constraint |
| `public.messages` | Individual messages within a conversation |
| `public.streak_logs` | Audit log of streak events |

All tables use Row Level Security (RLS). Three Postgres RPCs handle social interactions (see Database Functions below). The `record_upload_streak(p_user_id, p_upload_date)` Postgres function (SECURITY DEFINER, auth-guarded) is the authoritative source for streak updates — it uses `SELECT ... FOR UPDATE` to prevent race conditions on double-tap. Always call it before `createPost` so the post row receives the RPC-confirmed `streak_day` value.

---

## API Layer — `src/api/`

| File | Exports |
|---|---|
| `posts.ts` | `getFeedPosts` (via `get_feed_posts` RPC — returns `like_count`, `comment_count`, `liked_by_me`, and `tagged_users`), `getUserPosts`, `getPostDates` (distinct post dates for streak grid), `createPost` (accepts optional `taggedUserIds: string[]` to insert into `post_tags`), `FeedPost`, `FeedCursor`, `ProfilePostCursor`, `TaggedUser` |
| `social.ts` | `toggleLike` (single-RPC atomic toggle), `getComments`, `addComment`, `CommentWithProfile` |
| `follows.ts` | `followUser` (idempotent upsert), `unfollowUser`, `getFollowData` (single-RPC: `is_following` + `follower_count` + `following_count`) |
| `messages.ts` | `getInbox`, `getRequests`, `acceptRequest`, `sendMessage`, `createOrGetConversation`, `deleteConversation`, `getMessages`, `ConversationPreview`, `MsgRow` |
| `profile.ts` | `getProfile`, `searchProfiles`, `updateAvatarUrl`, `updateFitnessRoutine`, `ProfileSearchResult` |
| `streaks.ts` | `recordUpload`, `getStreakLogs`, `getActiveStreak` |
| `auth.ts` | Auth helpers |
| `email.ts` | OTP email via Edge Function |

All barrel-exported from `src/api/index.ts`.

---

## Navigation

The app uses **state-driven navigation** — no React Navigation. Transitions are handled by conditional rendering in `App.tsx` and by gesture-driven navigators.

### 2D Navigation Overview

```
           ← swipe right ←          → swipe left →
┌─────────────────────┬──────────────────────┬──────────────────────┐
│   ProfileScreen     │  VerticalNavigator   │   MessagesScreen     │
│  (horizontal left)  │  (center, default)   │ (horizontal right)   │
│                     │  ↕ swipe up/down ↕   │                      │
│                     │  Camera (index 0)    │                      │
│                     │  FeedScreen (index 1)│                      │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

Gesture ownership is axis-exclusive:
- `HorizontalNavigator`: claims `Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10`
- `VerticalNavigator`: claims `Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10`
- **Scroll guard:** on `FeedScreen` (index 1), downward swipes (back to Camera) are only claimed when the feed's `FlashList` is scrolled to the top (`y <= 2`). This prevents the navigator from stealing scroll gestures mid-feed.

### Horizontal Navigator (`src/screens/HorizontalNavigator.tsx`)

| Index | Panel | Access |
|---|---|---|
| 0 | `ProfileScreen` | Swipe right OR tap profile pill in header |
| 1 | `VerticalNavigator` | Default on entry |
| 2 | `MessagesScreen` | Swipe left OR tap messages icon in header |

Spring params: `damping: 22, stiffness: 160, mass: 0.9`. Rubber-band at both ends. Light haptic on snap.

### Vertical Navigator (`src/screens/VerticalNavigator.tsx`)

| Constant | Value | Description |
|---|---|---|
| `PEEK_HEIGHT` | `110` | Strip of the next screen visible at the bottom |
| `SLOT_HEIGHT` | `SCREEN_HEIGHT - PEEK_HEIGHT` | Visible height per active screen |
| `APP_HEADER_H` | `108` (iOS) / `80` (Android) | Height used for header animation range |

Each slot is `SCREEN_HEIGHT` tall, positioned at `top: i * SLOT_HEIGHT`. Active screen translated to fill viewport. Top `PEEK_HEIGHT` px of the next slot bleeds through naturally.

Render gating: only screens within ±1 index of `activeIndex` are fully mounted.

**Global Search:** Pull-down gesture from `CameraScreen` (index 0) opens `GlobalSearchOverlay` — a frosted-glass full-screen overlay (`BlurView`, zIndex 500). Users can search for other profiles via `searchProfiles()`. Tapping a search result opens `UserProfileOverlay` (zIndex 510) on top of the search results; from there the user can tap MESSAGE to open `ConversationScreen`. The search overlay manages its own `profileUserId` and `activeConvo` state internally (same pattern as `FeedScreen`). Tapping your own profile in search results is a no-op (own-profile guard). All state (query, results, profile, conversation) is reset when the overlay closes.

**Screen order (top → bottom):**

| Index | Screen |
|---|---|
| 0 | `CameraScreen` |
| 1 | `FeedScreen` |

`FeedScreen` receives two props from `VerticalNavigator`:
- `onScrollTopChange(atTop: boolean)` — fired when scroll crosses the `y <= 2` threshold; used to gate the swipe-back-to-camera gesture
- `headerAnim` — an `Animated.Value` (range 0–`APP_HEADER_H`) that `FeedScreen` drives via its scroll handler; `VerticalNavigator` applies this as a `translateY` on the `AppHeader` wrapper so the header slides off-screen on scroll-down and returns on scroll-up

### App Header (`src/components/AppHeader.tsx`)

Wrapped in an `Animated.View` inside `VerticalNavigator` at `zIndex: 200`, with `pointerEvents: 'box-none'` so touches pass through to screen content. The wrapper applies `translateY` from `headerAnim` to slide the header off-screen when the feed is scrolled down.

The header has a `LinearGradient` background (`expo-linear-gradient`) that fades vertically from opaque to transparent:
- Dark mode / Camera: `rgba(17,17,17,0.88) → rgba(17,17,17,0)`
- Light mode: `rgba(255,255,255,0.92) → rgba(255,255,255,0)`

```
[ ● ProfilePill ]      MAHI      [ ✉ MessagesIcon ]
```

- `isDark: true` (Camera, always dark bg) → white foreground
- `isDark: false` (Feed) → follows system theme

### Navigation Dots (`src/components/NavigationDots.tsx`)

Vertical pill dots on the right edge of `VerticalNavigator`. Each dot is tappable — tapping navigates directly to that screen via `onDotPress(index)` (passed from `VerticalNavigator` as `navigateTo`). The active dot expands to a `28×28` rounded square showing the screen icon; inactive dots are `6×6` pills.

Props:
- `count` / `activeIndex` / `dark` / `icons` — display config
- `onDotPress?: (index: number) => void` — tap-to-navigate callback

---

## Screens

| Screen | Path | Status |
|---|---|---|
| `SplashScreen` | `src/screens/SplashScreen.tsx` | Active — custom JS splash |
| `WelcomeScreen` | `src/screens/WelcomeScreen.tsx` | Active — sign-up / login |
| `HorizontalNavigator` | `src/screens/HorizontalNavigator.tsx` | Active — horizontal gesture nav |
| `VerticalNavigator` | `src/screens/VerticalNavigator.tsx` | Active — vertical gesture nav |
| `CameraScreen` | `src/screens/CameraScreen.tsx` | Active — **two-tap** dual-camera capture: tap 1 takes the front selfie and auto-flips to rear; the user frames the POV shot and taps 2 to capture the rear. `captureState` state machine: `idle → front → switching → awaiting-rear → rear → idle`. After both photos are captured, `DualPhotoPreview` Modal opens (rear full-screen + draggable front pip, tap pip to swap). Includes already-posted guard, optimistic upload + streak, caption editor with user tagging (see Caption + Tagging section), rest-day indicator (shows "REST DAY" label when today is not in `fitness_routine`), and Sentry error capture on upload failure |
| `FeedScreen` | `src/screens/FeedScreen.tsx` | Active — social feed from `useFeed()`; post metadata (avatar, username, timestamp, streak pill) overlaid on the image via `LinearGradient` (dark-to-transparent from top); dual-photo posts render a draggable pip (tap to swap) using `react-native-gesture-handler` `Gesture.Pan` + `react-native-reanimated` shared values with long-press activation and corner-snap; single-photo legacy posts render unchanged; 16:9 aspect ratio; captions + tagged users rendered via `CaptionText` component; header hide/show driven by scroll via `headerAnim` prop; scroll-top state reported via `onScrollTopChange` prop; tapping another user's avatar opens `UserProfileOverlay` → MESSAGE → `ConversationScreen` (profile + conversation overlays managed via local state); all interactions console-logged with `[FeedScreen]` prefix |
| `HomeScreen` | `src/screens/HomeScreen.tsx` | Placeholder |
| `SearchScreen` | `src/screens/SearchScreen.tsx` | Placeholder (global search is handled by `GlobalSearchOverlay` component, not this screen) |
| `ProfileScreen` | `src/screens/ProfileScreen.tsx` | Active — own profile, follower/following counts, streak stats, avatar picker (`AvatarPicker` component), training days editor (`TrainingDaysScreen` overlay), streak grid (`StreakGridPanel` — full-screen portrait calendar with months stacked vertically on the left, M T W T F S S column headers, and a pan-draggable canvas inside a bordered viewport; see `StreakGridPanel` notes below) |
| `MessagesScreen` | `src/screens/MessagesScreen.tsx` | Active — inbox + requests from `useMessages()`; tapping a row opens `ConversationScreen` as an absolute overlay; REQUESTS tab has ACCEPT and DENY pill buttons |
| `ConversationScreen` | `src/screens/ConversationScreen.tsx` | Active — individual message thread; inverted `FlatList` bubbles; real-time via `useConversation`; request banner (ACCEPT/DENY) shown to receiver on unaccepted conversations |
| `InAppAnimationScreen` | `src/screens/InAppAnimationScreen.tsx` | Active — post-login entry animation |

---

## StreakGridPanel (`src/components/StreakGridPanel.tsx`)

Full-screen portrait calendar overlay that visualises the user's post history. Mounted by `ProfileScreen` (own profile) and by `UserProfileOverlay` (other users' profiles) as a slide-in panel (slide handled by legacy RN `Animated`, not Reanimated — the slide and the pan canvas run on different views).

**Layout:**

```
┌─ panel ───────────────────────────────────┐
│  STREAK                                 × │
│  On a 12-day streak                       │
│      12 STREAK  │  17 BEST                │
│  ┌─ bordered viewport ─────────────────┐  │
│  │         M  T  W  T  F  S  S         │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │ Jan   □ □ □ □ □ □ □          │   │  │
│  │  │       □ □ ■ ■ □ ■ □          │   │  │
│  │  │ Feb   □ □ □ □ □ □ □          │   │  │
│  │  │  …    (pan-draggable canvas) │   │  │
│  │  └──────────────────────────────┘   │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

**Grid data** — `buildMonthGrid(todayStr)` returns 12 `MonthBlock`s covering the last 12 months ordered oldest → newest so the current month is the last row in the canvas. Each block contains `{ label, year, leadingBlanks, days[] }`. `leadingBlanks = (firstDayOfMonth.getDay() + 6) % 7` maps the 1st of the month to a Monday-first column offset. Days after today in the current month are omitted.

**Cell colouring** — same logic as the old grid (`getCellColor`). Posted → solid cyan (`#59c2d7`); today with no post → transparent + cyan border; past training days with no post → faded cyan (missed); rest days (not in `fitness_routine`) and future days → very faded cyan. The weekday for a rest-day check is derived from `(leadingBlanks + dayIdx) % 7` indexed into `WEEKDAY_NAMES` — no per-cell `Intl` lookups.

**Pan gesture** — the canvas sits inside a clipping viewport (`overflow: 'hidden'`) wrapped in a `GestureDetector` around a `Reanimated.View`. `Gesture.Pan()` updates a `translateY` shared value with a worklet clamp: `minY = Math.min(0, viewportH - contentH)` → `translateY = max(minY, min(0, startY + translationY))`. Vertical-only on purpose — the 7-column grid fits any portrait viewport, so X-pan would only desync the fixed weekday header. No long-press activation (immediate drag), no corner-snap, no spring-on-end — it's a map surface, not a widget.

**Initial position** — on first layout, `seedPosition()` reads `viewportH` and `contentH` (set via `onLayout` on the viewport and the canvas respectively) and seeds `translateY = min(0, viewportH - contentH)` so the current month lands near the bottom of the viewport (today visible). Idempotent — safe to re-seed on rotation. Shared values reset to 0 naturally on unmount; the panel unmounts when `visible && mounted` both go false, so re-opening gives a fresh pan state.

**Gesture isolation from parent navigators** — `HorizontalNavigator` and `VerticalNavigator` both use `PanResponder` with a 10px `onMoveShouldSet` threshold. RNGH installs native gesture recognizers that dispatch before the JS responder system, so touches landing inside the `GestureDetector` are captured by RNGH before the navigators' threshold is crossed. No `simultaneousHandlers` or `waitFor` configuration is required. Horizontal finger movement inside the grid is captured by the pan gesture (and ignored by the worklet), so it cannot bubble up and trigger a horizontal navigator page. Same pattern is used by the `FeedScreen` pip drag.

---

## Caption + Tagging

Users can attach an optional caption and tag up to 10 other users when posting. The whole flow lives inside the `DualPhotoPreview` modal in `CameraScreen.tsx` and renders in `FeedScreen.tsx`.

### Preview UI (`DualPhotoPreview`)

After both photos are captured, three controls stack above the POST button, all centred in `postButtonFloat`:

```
┌──────────────────────────────┐
│        ＋ Tag people          │  ← tag pill (tap → TagSheet)
├──────────────────────────────┤
│      ＋ Add a caption         │  ← caption pill (tap → CaptionSheet)
├──────────────────────────────┤
│            POST              │  ← existing post button
└──────────────────────────────┘
```

Both pills share the same `BlurView intensity={40} tint="dark"` treatment (height 36, radius 18, `#FFFFFF` text when filled, muted when empty) and both read from their respective parent state (`taggedUsers: TaggedUser[]`, `caption: string`). The tag pill label is computed by `tagPillLabel(taggedUsers)` — `'＋ Tag people'` for zero, `'@username'` for one, `'@user1 +N'` for two or more.

**Shared PIP-dodge.** Both pills live inside a single `Reanimated.View` with a `pillDodgeAnimStyle` driven by a `useDerivedValue` worklet. The worklet checks AABB intersection between the draggable PIP's current position and the union rect covering both pills (derived from `pillW`, `pillH`, `pillGap`, `postBtnH`). If the PIP overlaps, both pills lift together by `-(PIP_H + 16)` with a spring; when the PIP moves away, they spring back. The pills therefore never drift apart and always dodge as one unit.

### Sheet state machine

`DualPhotoPreview` holds two pieces of state that coordinate the sheets:

```ts
type ActiveSheet = 'none' | 'caption' | 'tag';
const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
const [captionAtIndex, setCaptionAtIndex] = useState<number | null>(null);
```

Only one sheet renders at a time (their `visible` props derive from `activeSheet`). Transitions:

| From | Trigger | To | Side effect |
|---|---|---|---|
| `'none'` | tap caption pill | `'caption'` | — |
| `'none'` | tap tag pill | `'tag'` | `captionAtIndex = null` |
| `'caption'` | user types `@` | `'tag'` | `onCaptionChange(currentText)` + `captionAtIndex = cursor-1` |
| `'caption'` | DONE / scrim / back | `'none'` | `onCaptionChange(draft.trim())` |
| `'tag'` | DONE | `'none'` | `onTaggedUsersChange(selected)` |
| `'tag'` | ✕ / scrim / back (pill flow) | `'none'` | — |
| `'tag'` | user tapped (singleShot, `@` flow) | `'caption'` | splice `@username ` at `captionAtIndex+1` into caption; append picked user to `taggedUsers` (deduped, capped at `MAX_TAGS`) |
| `'tag'` | ✕ / scrim / back (`@` flow) | `'caption'` | leave the typed `@` in place |

### `CaptionSheet` (`@` bridge)

Extends the simple `CaptionSheet` from the caption feature with one extra prop, `onOpenTagAt?: (atIndex, currentText) => void`. Inside, the `TextInput` now tracks the current caret via `onSelectionChange` into a `cursorRef: useRef<number>`, and `handleChangeText` detects a freshly-typed `@` at the cursor position. When detected, it fires `onOpenTagAt(cursor-1, next)` and early-returns without updating local `draft` state — the parent commits the text (including the `@`) and swaps the active sheet to `'tag'`.

### `TagSheet` + `TagUserRow`

New bottom sheet defined alongside `CaptionSheet` in `CameraScreen.tsx`. Visual shell matches the caption sheet (slide-up `Modal`, `Pressable` scrim dismiss, `KeyboardAvoidingView`, `sheetPanel` panel with grab handle + label row). Differences:

- **Top-right ✕ close button** (`sheetCloseX`) — absolutely positioned, 28×28 hit target. Required because multi-select needs distinct commit vs cancel affordances.
- **Search input** (`tagSearchInput`) — 44pt pill, `autoFocus`, 350ms debounced `searchProfiles(q, 20)` matching the existing `GlobalSearchOverlay` pattern.
- **Result list** — `FlatList` of `TagUserRow` rows, `keyboardShouldPersistTaps="handled"`, `maxHeight: SCREEN_HEIGHT * 0.45`. Each row renders the `ProfileSearchResult`'s avatar (or initial fallback), display name, `@handle`, and a cyan `✓` when selected. Tapping a row toggles membership in the local `selected: TaggedUser[]` state.
- **`MAX_TAGS = 10`** — attempting to add an 11th fires a `Haptics.NotificationFeedbackType.Warning` and no-ops.
- **DONE button** — same cyan treatment as the caption sheet; calls `onCommit(selected)`.
- **`singleShot` prop** — when `true` (set by the `@` bridge via `singleShot={captionAtIndex !== null}`), the sheet hides the counter and DONE button, and `toggle()` commits immediately with the single tapped user. This is the `@`-autocomplete behaviour.

### `TaggedBubbleStack` (on-photo overlay)

Shared component at `src/components/TaggedBubbleStack.tsx`. Renders a vertical stack of `@username` bubbles (`BlurView intensity={40} tint="dark"`, 28pt height, 14pt radius, `rgba(0,0,0,0.45)` background, white italic text) — max 3 visible, 4th+ collapses to a `+N more` chip. Returns `null` when `users.length === 0`.

- **Default positioning** is absolute `left: 16, bottom: 16` with `alignItems: 'flex-start'`. Uses `pointerEvents="box-none"` so taps outside the bubbles pass through to the photo.
- **Accepts an optional `style` prop** to override the default anchor — used by the camera preview to lift the stack above the pill column (`bubbleStackBottom` is computed from `pillsT` and a 16pt gap).
- **Accepts an optional `onPressUser` prop** — when provided, tapping a bubble fires with the `TaggedUser`. When absent (e.g. in the preview), the `TouchableOpacity` is `disabled` and taps fall through.
- **Z-order requirement.** In both the preview and the feed, `TaggedBubbleStack` is rendered **before** the draggable PIP in JSX source order so the PIP paints on top. Dragging the PIP into the bubble region should not hide the PIP — the bubbles yield visually to the user-controlled interactive element.

### Feed display (`FeedScreen`)

Inside each `PostItem`, the `TaggedBubbleStack` is rendered as an absolute overlay inside `styles.imageContainer` (which already has `position: 'relative'`), passed the post's `tagged_users` array plus an `onPressUser` handler that routes through the existing `onAvatarPress(userId)` → `UserProfileOverlay` flow.

The caption itself is rendered via the `CaptionText` component (`src/components/CaptionText.tsx`):

- When `tagged.length === 0`, returns a plain `<Text>` — fast path.
- Otherwise builds a regex `@(user1|user2|...)\b` from the tagged users' usernames (defensively regex-escaped), walks the caption with `matchAll`, and emits a mixed array of plain string segments and cyan `<Text>` spans for each `@username` match.
- Each cyan span has its own `onPress` handler firing `onPressUser(user)` for that username — tapping jumps to the user's profile the same way a bubble does.

### Persistence + read path

- **`public.posts.caption`** stores the optional caption string (nullable).
- **`public.post_tags`** (junction: `post_id`, `user_id`) stores tag relationships, inserted by `createPost` after the post row lands. `createPost` dedups `taggedUserIds` via `Array.from(new Set(...))` before inserting, and surfaces partial-failure (post created but tag insert failed) via the returned `{ data, error }` tuple. `CameraScreen`'s `uploadPhotos` handler treats that as "confirm post, log tag failure to Sentry, move on."
- **`get_feed_posts` RPC** returns an extra `tagged_users` column built by a correlated `jsonb_agg` over `post_tags` joined to `profiles`, wrapped in `coalesce(..., '[]'::jsonb)` so the client always receives an array (never `null`). See `docs/integrations.md` for the full function contract.
- **`FeedPost.tagged_users: TaggedUser[]`** is required (non-null). The `src/api/posts.ts:getFeedPosts` row mapper passes `row.tagged_users` straight through — no fallback needed because the SQL coalesces.

---

## Boot Sequence

```
App launch
  OS renders native splash
  JS bundle loads
  SplashScreen.preventAutoHideAsync()       ← module scope in App.tsx
  App renders → splashDone=false → <SplashScreen onLayout={...} />
    → SplashScreen.hideAsync()              ← native gone, custom still visible
    → setSplashDone(true)

  supabase.auth.getSession()
    → session found:
        setSession(s) → setIsLoading(false)
        getProfile()  → useUserStore.setProfile()
        useFeedStore.sync()        [background]
        useMessagesStore.sync()    [background]
        → <InAppAnimationScreen onComplete → showCamera=true>
        → <HorizontalNavigator />           ← stores already populated

    → no session:
        setIsLoading(false)
        → <WelcomeScreen />
```

---

## Config

App config lives in `app.config.js`.

| Field | Value |
|---|---|
| `version` | `0.1.0` |
| `newArchEnabled` | `true` — React Native new architecture (JSI/Fabric) |
| `userInterfaceStyle` | `automatic` — system light/dark mode |
| `extra.buildNumber` | `'1'` — read by `SplashScreen.tsx` for version display |
