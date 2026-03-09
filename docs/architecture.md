# Mahi Fitness — Architecture

## Overview

Mahi Fitness is a React Native fitness application built with Expo. It uses Supabase for backend/auth, Zustand for client state, and is structured for future analytics (PostHog) and error tracking (Sentry).

## Tech Stack

| Layer | Tool | Version |
|---|---|---|
| Framework | Expo (React Native) | ~54.0.33 |
| Language | TypeScript (strict) | ~5.9.2 |
| Backend / Auth | Supabase | ^2.96.0 |
| State Management | Zustand | ^5.0.11 |
| Session Storage | AsyncStorage | ^2.2.0 |
| Analytics | PostHog *(placeholder)* | ^4.35.0 |
| Error Tracking | Sentry *(placeholder)* | ^8.0.0 |

## Project Structure

```
mahi-fitness/
├── src/
│   ├── lib/            # Singleton clients (Supabase, PostHog, Sentry)
│   ├── store/          # Zustand global state
│   ├── hooks/          # Custom React hooks
│   ├── types/          # TypeScript types and DB schema types
│   ├── components/     # Shared UI components (TBD)
│   ├── screens/        # Screen-level components (TBD)
│   └── utils/          # Pure utility functions (TBD)
├── docs/               # Project documentation
├── assets/             # Images, icons, splash
├── App.tsx             # Root component
├── index.ts            # Entry point (registerRootComponent)
└── app.config.js       # Expo config (dynamic, replaces app.json)
```

## Data Flow

```
Supabase (auth events)
        │
        ▼
  useAuthStore (Zustand)
        │
        ▼
  Screens / Components
        │
        ▼
  useUserStore (Zustand)
```

## Environment

All runtime config uses Expo's `EXPO_PUBLIC_` prefix so values are embedded at build time. See `.env.example` for required keys.

## New Architecture Enabled

`newArchEnabled: true` is set in `app.config.js` — the app targets React Native's new architecture (JSI/Fabric).

---

## Navigation

The app uses **state-driven navigation** with no React Navigation library. Screen transitions are handled by conditional rendering in `App.tsx` and by `HorizontalNavigator` for the authenticated app.

### 2D Navigation Overview

Navigation is a two-axis system:

```
           ← swipe right ←          → swipe left →
┌─────────────────────┬──────────────────────┬──────────────────────┐
│   ProfileScreen     │  VerticalNavigator   │   MessagesScreen     │
│  (horizontal left)  │  (center, default)   │ (horizontal right)   │
│                     │  ↕ swipe up/down ↕   │                      │
│                     │  Camera              │                      │
│                     │  Activity            │                      │
│                     │  Home                │                      │
│                     │  Search              │                      │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

Gesture ownership is axis-exclusive — no conflicts between nested PanResponders:
- `HorizontalNavigator`: claims `Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10`
- `VerticalNavigator`: claims `Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10`

### Horizontal Navigator (`src/screens/HorizontalNavigator.tsx`)

Top-level navigator. Renders three full-screen panels in a horizontal tape (`flexDirection: 'row'`). Default panel: index 1 (VerticalNavigator). Translates the tape with `hTapeAnim` (initial value: `-SCREEN_WIDTH`).

**Panels:**

| Index | Panel | Access |
|---|---|---|
| 0 | `ProfileScreen` | Swipe right OR tap profile pill in header |
| 1 | `VerticalNavigator` | Default — shown on app entry |
| 2 | `MessagesScreen` | Swipe left OR tap messages icon in header |

**Layout:** `hTapeAnim = -(index * SCREEN_WIDTH)`. Spring params: `damping: 22, stiffness: 160, mass: 0.9`. Rubber-band resistance at both ends (divides overshoot by 3). Light haptic on each snap. Passes `onNavigateLeft` and `onNavigateRight` callbacks to `VerticalNavigator` which wires them to the `AppHeader` buttons.

### Vertical Navigator (`src/screens/VerticalNavigator.tsx`)

Manages 4 vertically stacked screens in a doom-scroll tape. Accepts `onNavigateLeft` / `onNavigateRight` props from `HorizontalNavigator`.

**Layout constants:**

| Constant | Value | Description |
|---|---|---|
| `SCREEN_HEIGHT` | device height | Full device viewport height |
| `PEEK_HEIGHT` | `110` | Strip of the next screen visible at the bottom |
| `SLOT_HEIGHT` | `SCREEN_HEIGHT - PEEK_HEIGHT` | Visible height per active screen |

**How the peek works:**

Each slot is positioned at `top: i * SLOT_HEIGHT` in the tape and is `SCREEN_HEIGHT` tall. When screen `i` is active, the tape is translated by `-(i * SLOT_HEIGHT)`. This makes the top `PEEK_HEIGHT` pixels of screen `i+1` bleed through at the bottom — the "peek strip". No separate peek components needed; the geometry produces it naturally.

**Peek border radius animation:**

Each slot (index > 0) enters with `borderTopLeftRadius/RightRadius: 40`, driven by `tapeAnim.interpolate`. As it transitions from peeking to active the radius collapses to `0`. Uses `useNativeDriver: false` (border radius is not a transform); same `tapeAnim` drives `translateY` with `useNativeDriver: true` — both are supported simultaneously on one `Animated.Value`.

**Gesture thresholds:**

| Constant | Value |
|---|---|
| `SWIPE_PX` | `60` px drag distance |
| `SWIPE_VY` | `0.4` release velocity |

Rubber-band resistance at first and last screen. Peek-zone haptic (Medium) when touch starts in bottom `PEEK_HEIGHT` pixels. Light haptic on each snap.

**Screen order (top → bottom):**

| Index | Screen | Dark bg | Light bg |
|---|---|---|---|
| 0 | Camera (entry) | `#111111` | `#111111` |
| 1 | Activity | `#1C1C19` | `#FFFFFF` |
| 2 | Home | `#1C1C19` | `#FFFFFF` |
| 3 | Search | `#1C1C19` | `#FFFFFF` |

Camera is always at the top (no rounded-top entry animation). Render gating: only screens within ±1 index of `activeIndex` are fully mounted; others render as plain coloured placeholders.

### App Header (`src/components/AppHeader.tsx`)

Absolute overlay rendered inside `VerticalNavigator` at `zIndex: 200`. Appears on all 4 vertical screens. `pointerEvents: 'box-none'` so touches pass through to the camera feed and screen content; only the buttons receive input.

```
[ ● ProfilePill ]      MAHI      [ ✉ MessagesIcon ]
  36×36 circle         centered     22px icon
  left: 0              title        right: 24
```

- `isDark: true` (Camera, always dark bg) → white foreground
- `isDark: false` (Activity / Home / Search) → follows theme (`#1A1A17` / `#E8E8E3`)
- Profile pill taps → `onProfilePress` → `HorizontalNavigator.navigateHorizontal(0)`
- Messages icon taps → `onMessagesPress` → `HorizontalNavigator.navigateHorizontal(2)`

### Navigation Dots (`src/components/NavigationDots.tsx`)

Vertical pill dots on the right edge of VerticalNavigator. Shows 4 dots (one per vertical screen). Active dot: 28×28 rounded square with the screen's SVG icon fading in; inactive: 6×6 circle at 0.35 opacity. Animated via `Animated.spring` with `useNativeDriver: false`. Camera screen forces `dark=true` (white dots). `pointerEvents: 'none'` — visual only.

### Messages Screen (`src/screens/MessagesScreen.tsx`)

Tabbed placeholder screen (horizontal right panel). Two tabs: **INBOX** and **REQUESTS**. Animated underline indicator slides between tabs via `Animated.spring`. Both tabs are empty state placeholders — no backend wiring yet.

---

## Screens

| Screen | Path | Purpose |
|---|---|---|
| `SplashScreen` | `src/screens/SplashScreen.tsx` | Custom JS splash — mirrors native splash, shown until native hides |
| `WelcomeScreen` | `src/screens/WelcomeScreen.tsx` | Unauthenticated landing — MAHI logo, tagline, sign-up and login buttons |
| `VerticalNavigator` | `src/screens/VerticalNavigator.tsx` | Authenticated root — vertical doom-scroll between all main screens |
| `CameraScreen` | `src/screens/CameraScreen.tsx` | Primary screen (index 0) — camera feed, shutter, streak badge |
| `ActivityScreen` | `src/screens/ActivityScreen.tsx` | Index 1 — workout activity log (placeholder) |
| `HomeScreen` | `src/screens/HomeScreen.tsx` | Index 2 — feed/dashboard (placeholder) |
| `SearchScreen` | `src/screens/SearchScreen.tsx` | Index 3 — discovery (placeholder) |
| `ProfileScreen` | `src/screens/ProfileScreen.tsx` | Index 4 — user profile (placeholder) |

## Boot Sequence

```
App launch
  OS renders native splash  ← backgroundColor from expo-splash-screen plugin
  JS bundle loads
  SplashScreen.preventAutoHideAsync()  ← module scope in App.tsx
  App renders → splashDone=false → <SplashScreen onLayout={...} />
  SplashScreen root View lays out (drawn to screen)
    → SplashScreen.hideAsync()  ← native gone, custom already visible
    → setSplashDone(true)
  → <WelcomeScreen />
```

The native splash and custom splash are visually identical — same colors, same centered MAHI text. The handoff is seamless. Auth initialization will be wired into this flow when navigation is built.

## Config

App config lives in `app.config.js` (CommonJS, replaces `app.json`). Dynamic config enables config plugin support and runtime values.

| Field | Value |
|---|---|
| `version` | `0.1.0` |
| `extra.buildNumber` | `'1'` — read by `SplashScreen.tsx` for version display |
| `userInterfaceStyle` | `automatic` — system light/dark mode |
