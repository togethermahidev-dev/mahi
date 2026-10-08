import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import { env } from '@/lib/env';
import { OTA_NUMBER } from '@/constants/ota';
import {
  buildErrorReport,
  scrubBreadcrumb,
  sentryEnvironment,
  type ErrorContext,
} from '@/lib/errorReport';

/**
 * On in every installed app (preview, TestFlight, App Store) when a DSN is baked in; off on a dev
 * machine. The environment is the update channel, so preview and production never mix. Every
 * event carries the OTA number and update id, so a report says exactly which update it came from.
 */
export function initSentry() {
  Sentry.init({
    dsn: env.sentryDsn ?? undefined,
    environment: sentryEnvironment(Updates.channel, __DEV__),
    enabled: !!env.sentryDsn && !__DEV__,
    tracesSampleRate: 1.0,
    attachStacktrace: true,
    // Network and navigation breadcrumbs lose their query (search text, link codes).
    beforeBreadcrumb: scrubBreadcrumb,
    initialScope: {
      tags: {
        ota: String(OTA_NUMBER),
        update_id: Updates.updateId ?? 'embedded',
        runtime: Updates.runtimeVersion ?? 'unknown',
        channel: Updates.channel ?? 'none',
      },
    },
  });
}

/**
 * The one way to report something that went wrong. Use it in every catch and on every
 * `{ error }` returned by Supabase:
 *
 *   if (error) reportError(error, { flow: 'posts', action: 'create', extra: { postId } });
 *
 * For a server function failure it also reads the function's reply, which holds the real reason.
 */
export function reportError(raw: unknown, ctx: ErrorContext): void {
  void send(raw, ctx);
}

async function send(raw: unknown, ctx: ErrorContext) {
  const extra: Record<string, unknown> = { ...ctx.extra };
  const response = raw && typeof raw === 'object' ? (raw as { context?: unknown }).context : null;
  if (response && typeof (response as Response).clone === 'function') {
    try {
      extra.server_status = (response as Response).status;
      extra.server_reply = (await (response as Response).clone().text()).slice(0, 1000);
    } catch {
      // The reply was already read or isn't text; the status is enough.
    }
  }

  const report = buildErrorReport(raw, { ...ctx, extra });
  if (__DEV__) console.error(report.error.message, report.context);
  Sentry.withScope((scope) => {
    scope.setLevel(report.level);
    scope.setTags(report.tags);
    scope.setContext('failure', report.context);
    scope.setFingerprint(report.fingerprint);
    Sentry.captureException(report.error);
  });
}

export { Sentry };
