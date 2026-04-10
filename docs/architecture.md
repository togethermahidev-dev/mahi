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
| Gestures | react-native-gesture-handler | — |
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
│   ├── components/     # Shared UI components (AppHeader, NavigationDots, ThemeToggle, UserProfileOverlay, GlobalSearchOverlay, AvatarPicker, TrainingDaysScreen, StreakGridPanel)
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
| `public.conversations` | Messaging thread — one row per pair, ordered participants constraint |
| `public.messages` | Individual messages within a conversation |
| `public.streak_logs` | Audit log of streak events |

All tables use Row Level Security (RLS). Three Postgres RPCs handle social interactions (see Database Functions below). The `record_upload_streak(p_user_id, p_upload_date)` Postgres function (SECURITY DEFINER, auth-guarded) is the authoritative source for streak updates — it uses `SELECT ... FOR UPDATE` to prevent race conditions on double-tap. Always call it before `createPost` so the post row receives the RPC-confirmed `streak_day` value.

---

## API Layer — `src/api/`

| File | Exports |
|---|---|
| `posts.ts` | `getFeedPosts` (via `get_feed_posts` RPC — returns `like_count`, `comment_count`, `liked_by_me`), `getUserPosts`, `getPostDates` (distinct post dates for streak grid), `createPost`, `FeedPost`, `FeedCursor`, `ProfilePostCursor` |
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
| `CameraScreen` | `src/screens/CameraScreen.tsx` | Active — sequential dual-camera capture (front selfie → auto-flip → rear POV ~800 ms later), dual-photo preview (`DualPhotoPreview` Modal: rear full-screen + draggable front pip, tap pip to swap), already-posted guard, optimistic upload + streak, rest-day indicator (shows "REST DAY" label when today is not in `fitness_routine`), Sentry error capture on upload failure |
| `FeedScreen` | `src/screens/FeedScreen.tsx` | Active — social feed from `useFeed()`; post metadata (avatar, username, timestamp, streak pill) overlaid on the image via `LinearGradient` (dark-to-transparent from top); dual-photo posts show a pip overlay (tap to swap); single-photo legacy posts render unchanged; 16:9 aspect ratio; header hide/show driven by scroll via `headerAnim` prop; scroll-top state reported via `onScrollTopChange` prop; tapping another user's avatar opens `UserProfileOverlay` → MESSAGE → `ConversationScreen` (profile + conversation overlays managed via local state); all interactions console-logged with `[FeedScreen]` prefix |
| `HomeScreen` | `src/screens/HomeScreen.tsx` | Placeholder |
| `SearchScreen` | `src/screens/SearchScreen.tsx` | Placeholder (global search is handled by `GlobalSearchOverlay` component, not this screen) |
| `ProfileScreen` | `src/screens/ProfileScreen.tsx` | Active — own profile, follower/following counts, streak stats, avatar picker (`AvatarPicker` component), training days editor (`TrainingDaysScreen` overlay), streak grid (`StreakGridPanel` overlay) |
| `MessagesScreen` | `src/screens/MessagesScreen.tsx` | Active — inbox + requests from `useMessages()`; tapping a row opens `ConversationScreen` as an absolute overlay; REQUESTS tab has ACCEPT and DENY pill buttons |
| `ConversationScreen` | `src/screens/ConversationScreen.tsx` | Active — individual message thread; inverted `FlatList` bubbles; real-time via `useConversation`; request banner (ACCEPT/DENY) shown to receiver on unaccepted conversations |
| `InAppAnimationScreen` | `src/screens/InAppAnimationScreen.tsx` | Active — post-login entry animation |

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
