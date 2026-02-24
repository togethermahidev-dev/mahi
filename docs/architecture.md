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

## Screens

| Screen | Path | Purpose |
|---|---|---|
| `SplashScreen` | `src/screens/SplashScreen.tsx` | Custom JS splash — mirrors native splash, shown until native hides |
| `WelcomeScreen` | `src/screens/WelcomeScreen.tsx` | Unauthenticated landing — MAHI logo, tagline, sign-up and login buttons |

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
