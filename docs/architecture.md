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
└── app.json            # Expo config
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

`newArchEnabled: true` is set in `app.json` — the app targets React Native's new architecture (JSI/Fabric).
