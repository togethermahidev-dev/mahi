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
| Analytics | PostHog *(placeholder)* | ^4.35.0 |
| Error Tracking | Sentry *(placeholder)* | ^8.0.0 |

---

## Project Structure

```
mahi-fitness/
├── src/
│   ├── api/            # Supabase query functions (posts, messages, profile, streaks, auth)
│   ├── lib/            # Singleton clients (Supabase, PostHog, Sentry)
│   ├── store/          # Zustand global state (feedStore, messagesStore, authStore, userStore, …)
│   ├── hooks/          # Thin store wrappers + utility hooks
│   ├── types/          # TypeScript types — database.ts is the source of truth for DB shapes
│   ├── components/     # Shared UI components (AppHeader, NavigationDots, ThemeToggle)
│   └── screens/        # Screen-level components
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
    ├── getProfile(userId)         → useUserStore.setProfile()
    ├── useFeedStore.sync()        → background, non-blocking
    └── useMessagesStore.sync()    → background, non-blocking
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `public.profiles` | User profile — display name, avatar, streak counters |
| `public.posts` | Daily streak photos — one per user per day. `image_url` = rear/POV photo; `pov_image_url` = front selfie (nullable — null on legacy single-photo posts). Enforced by unique index `posts_user_day_unique (user_id, (created_at AT TIME ZONE 'UTC')::date)` and RLS INSERT policy |
| `public.conversations` | Messaging thread — one row per pair, ordered participants constraint |
| `public.messages` | Individual messages within a conversation |
| `public.streak_logs` | Audit log of streak events |

All tables use Row Level Security (RLS). The `record_upload_streak(p_user_id, p_upload_date)` Postgres function (SECURITY DEFINER, auth-guarded) is the authoritative source for streak updates — it uses `SELECT ... FOR UPDATE` to prevent race conditions on double-tap. Always call it before `createPost` so the post row receives the RPC-confirmed `streak_day` value.

---

## API Layer — `src/api/`

| File | Exports |
|---|---|
| `posts.ts` | `getFeedPosts`, `getUserPosts`, `createPost` (options object), `FeedPost`, `FeedCursor`, `ProfilePostCursor` |
| `messages.ts` | `getInbox`, `getRequests`, `acceptRequest`, `sendMessage`, `ConversationPreview` |
| `profile.ts` | `getProfile` |
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
│                     │  Camera              │                      │
│                     │  Home (PRO)          │                      │
│                     │  Search              │                      │
│                     │                      │                      │
│                     │  + SOCIAL FEED pill  │                      │
│                     │  (Modal overlay)     │                      │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

Gesture ownership is axis-exclusive:
- `HorizontalNavigator`: claims `Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10`
- `VerticalNavigator`: claims `Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10`

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

Each slot is `SCREEN_HEIGHT` tall, positioned at `top: i * SLOT_HEIGHT`. Active screen translated to fill viewport. Top `PEEK_HEIGHT` px of the next slot bleeds through naturally.

Render gating: only screens within ±1 index of `activeIndex` are fully mounted.

**Screen order (top → bottom):**

| Index | Screen |
|---|---|
| 0 | Camera |
| 1 | Home |
| 2 | Search |

The social feed is accessed via the floating `SOCIAL FEED ↑` pill in `HorizontalNavigator`, which opens `FeedModal` — it is not a vertical navigator slot.

### App Header (`src/components/AppHeader.tsx`)

Absolute overlay inside `VerticalNavigator` at `zIndex: 200`. `pointerEvents: 'box-none'` so touches pass through to screen content.

```
[ ● ProfilePill ]      MAHI      [ ✉ MessagesIcon ]
```

- `isDark: true` (Camera, always dark bg) → white foreground
- `isDark: false` (Feed / Home / Search) → follows theme

---

## Screens

| Screen | Path | Status |
|---|---|---|
| `SplashScreen` | `src/screens/SplashScreen.tsx` | Active — custom JS splash |
| `WelcomeScreen` | `src/screens/WelcomeScreen.tsx` | Active — sign-up / login |
| `HorizontalNavigator` | `src/screens/HorizontalNavigator.tsx` | Active — horizontal gesture nav |
| `VerticalNavigator` | `src/screens/VerticalNavigator.tsx` | Active — vertical gesture nav |
| `CameraScreen` | `src/screens/CameraScreen.tsx` | Active — sequential dual-camera capture (front selfie → auto-flip → rear POV ~800 ms later), dual-photo preview (`DualPhotoPreview` Modal: rear full-screen + draggable front pip, tap pip to swap), already-posted guard, optimistic upload + streak |
| `FeedScreen` | `src/screens/FeedScreen.tsx` | Active — social feed from `useFeed()`; dual-photo posts show a pip overlay (tap to swap primary/pip); single-photo legacy posts render unchanged; post images render at 16:9 aspect ratio (`SCREEN_WIDTH × 9/16`); "SOCIAL FEED" title fades out on scroll (threshold 10px) and fades back in at the top |
| `HomeScreen` | `src/screens/HomeScreen.tsx` | Placeholder |
| `SearchScreen` | `src/screens/SearchScreen.tsx` | Placeholder |
| `ProfileScreen` | `src/screens/ProfileScreen.tsx` | Active — profile + streak stats |
| `MessagesScreen` | `src/screens/MessagesScreen.tsx` | Active — inbox + requests from `useMessages()` |
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
