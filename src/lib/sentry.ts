import * as Sentry from '@sentry/react-native';
import { env } from '@/lib/env';

export function initSentry() {
  const enabled = env.appEnv === 'production';
  Sentry.init({
    dsn: env.sentryDsn ?? undefined,
    environment: env.appEnv,
    enabled,
    tracesSampleRate: 1.0,
  });
}

export { Sentry };
