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

The app uses **state-driven navigation** with no React Navigation library. Screen transitions are handled by conditional rendering in `App.tsx` and by `VerticalNavigator` for the authenticated app.

### Vertical Doom-Scroll Navigator (`src/screens/VerticalNavigator.tsx`)

Authenticated screens are stacked vertically in a single "tape" layout. The user swipes up/down to move between screens — like a vertical doom-scroll feed.

**Layout constants:**

| Constant | Value | Description |
|---|---|---|
| `SCREEN_HEIGHT` | device height | Full device viewport height |
| `PEEK_HEIGHT` | `110` | Strip of the next screen visible at the bottom |
| `SLOT_HEIGHT` | `SCREEN_HEIGHT - PEEK_HEIGHT` | Visible height per active screen |

**How the peek works:**

Each slot is positioned at `top: i * SLOT_HEIGHT` in the tape and is `SCREEN_HEIGHT` tall. When screen `i` is active, the tape is translated by `-(i * SLOT_HEIGHT)`. This makes the top `PEEK_HEIGHT` pixels of screen `i+1` bleed through at the bottom — the "peek strip". No extra peek components are needed; the geometry produces it naturally.

**Peek border radius animation:**

Each slot (index > 0) enters with `borderTopLeftRadius: 40` and `borderTopRightRadius: 40`, driven by an `Animated.Value` interpolation of `tapeAnim`. As the screen transitions from peeking to active, the radius collapses to `0`. This uses `useNativeDriver: false` (border radius is not a transform); the same `tapeAnim` also drives `translateY` with `useNativeDriver: true` — both are supported simultaneously.

**Gesture thresholds:**

| Constant | Value |
|---|---|
| `SWIPE_PX` | `60` px drag distance |
| `SWIPE_VY` | `0.4` release velocity |

Rubber-band resistance is applied at the first and last screen (divides overshoot by 3). A haptic fires when the user's touch starts inside the peek strip zone (`pageY > SCREEN_HEIGHT - PEEK_HEIGHT`), plus a light haptic on each successful snap.

**Screen order (top → bottom):**

| Index | Screen | Dark bg | Light bg |
|---|---|---|---|
| 0 | Camera (entry) | `#111111` | `#111111` |
| 1 | Activity | `#1C1C19` | `#FFFFFF` |
| 2 | Home | `#1C1C19` | `#FFFFFF` |
| 3 | Search | `#1C1C19` | `#FFFFFF` |
| 4 | Profile | `#1C1C19` | `#FFFFFF` |

Camera screen is always at the top; it never gets a rounded-top entry animation (radius = 0 always). Render gating: only screens within ±1 index of `activeIndex` are fully mounted; others render as a plain coloured placeholder.

### Navigation Dots (`src/components/NavigationDots.tsx`)

Vertical pill dots on the right edge of the screen. Active dot: 20 px tall, opacity 1.0. Inactive: 6 px tall, opacity 0.35. Animated via `Animated.spring` with `useNativeDriver: false` (height is not a transform). Colour: `dark ? '#FFFFFF' : '#1A1A17'`. Camera screen forces `dark=true` since its background is always dark. `pointerEvents: 'none'` — visual only.

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
