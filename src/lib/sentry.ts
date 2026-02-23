import * as Sentry from '@sentry/react-native';

export function initSentry() {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    enabled: process.env.EXPO_PUBLIC_APP_ENV === 'production',
    tracesSampleRate: 1.0,
  });
}

export { Sentry };
