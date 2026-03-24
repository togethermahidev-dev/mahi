import * as Sentry from '@sentry/react-native';

export function initSentry() {
  const env = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
  const enabled = env === 'production';
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: env,
    enabled,
    tracesSampleRate: 1.0,
  });
}

export { Sentry };
