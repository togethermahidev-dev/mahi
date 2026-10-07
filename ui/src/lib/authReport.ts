import { isPersonAuthAnswer } from '@/lib/account';
import { Sentry, reportError } from '@/lib/sentry';

/**
 * Log-in, code and sign-up failures: a wrong password, old code or too many tries is the person,
 * so only a breadcrumb; a lost connection or anything unknown is reported.
 */
export function reportAuthError(raw: unknown, flow: string, action: string): void {
  const message = (raw as { message?: unknown } | null)?.message;
  if (isPersonAuthAnswer(typeof message === 'string' ? message : null)) {
    Sentry.addBreadcrumb({ category: flow, message: `${action}: ${message}`, level: 'info' });
    return;
  }
  reportError(raw, { flow, action });
}
