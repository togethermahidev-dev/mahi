/**
 * Typed, fail-fast environment accessor.
 *
 * Single source of truth for every `EXPO_PUBLIC_*` variable. Required vars are
 * validated once at module load — a missing var throws a clear error at startup
 * instead of letting `undefined` reach an SDK and fail cryptically later.
 *
 * Every read below is written as `process.env.EXPO_PUBLIC_X` with dot notation.
 * Metro replaces only that exact form with the value at build time; a lookup by
 * name such as `process.env[name]` is left alone and is `undefined` in a release
 * build, which crashes the app on launch. The variable name is passed
 * separately so the error message can still say which one is missing.
 *
 * Import `env` everywhere instead of reading `process.env.X` directly.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable: ${name}. ` +
        `Add it to your .env (see .env.example).`
    );
  }
  return value;
}

export const env = {
  /** Supabase project URL — required. */
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  /** Supabase anon (public) key — required. */
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ),

  /** PostHog project key — optional (analytics degrades gracefully if absent). */
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? null,
  /** PostHog host — defaults to the value used before centralisation. */
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',

  /** Sentry DSN — optional. */
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? null,

  /** App environment: 'development' | 'preview' | 'production'. */
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
} as const;
