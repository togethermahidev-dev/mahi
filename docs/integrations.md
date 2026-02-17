# Integrations

## expo-splash-screen

**Status: Active**

Controls the native OS splash screen and provides the JS-side API for hiding it.

- Config plugin in `app.config.js` writes adaptive splash colors to native iOS/Android at prebuild time
- Light background: `#F5F5F0`, dark background: `#0F0F0D`
- `SplashScreen.preventAutoHideAsync()` — called at module scope in `App.tsx` to hold the native splash until our custom JS splash is drawn
- `SplashScreen.hideAsync()` — called from `onLayout` in `SplashScreen.tsx` after the custom splash confirms it is rendered

The splash image (`assets/splash-icon.png`) is currently the Expo default placeholder. Replace with the final MAHI logo (white text, transparent background PNG) before a native prebuild.

---

## Supabase — `src/lib/supabase.ts`

**Status: Active**

The primary backend. Provides auth, database, and storage.

- Client is a singleton created with `createClient()`
- Session is persisted via `AsyncStorage` (survives app restarts)
- `autoRefreshToken: true` — tokens refresh silently in the background
- `detectSessionInUrl: false` — disabled for native (no deep-link OAuth magic links)

**Required env vars:**
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

**To generate typed DB client** once schema exists:
```bash
npx supabase gen types typescript --project-id <project-id> > src/types/database.ts
```

---

## PostHog — `src/lib/posthog.ts`

**Status: Placeholder (not active)**

Product analytics. Currently exports `null`.

**To activate:**
1. Add `EXPO_PUBLIC_POSTHOG_API_KEY` to `.env`
2. Uncomment the implementation in `src/lib/posthog.ts`
3. Wrap root component with `PostHogProvider` in `App.tsx`

**Required env vars:**
```
EXPO_PUBLIC_POSTHOG_API_KEY
EXPO_PUBLIC_POSTHOG_HOST   # default: https://us.i.posthog.com
```

---

## Sentry — `src/lib/sentry.ts`

**Status: Placeholder (not active, no DSN yet)**

Error and crash reporting. `initSentry()` is currently a no-op.

**To activate:**
1. Create a project at sentry.io and copy the DSN
2. Add `EXPO_PUBLIC_SENTRY_DSN` to `.env`
3. Uncomment the implementation in `src/lib/sentry.ts`
4. Call `initSentry()` at the top of `App.tsx` before anything renders

**Required env vars:**
```
EXPO_PUBLIC_SENTRY_DSN
EXPO_PUBLIC_APP_ENV   # 'development' | 'production' — Sentry only active in production
```
