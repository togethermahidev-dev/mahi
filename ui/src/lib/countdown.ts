import { plural } from './relativeTime';

/**
 * Time left until a server deadline, measured on the server's clock.
 * `serverOffsetMs` = server time − device time, taken when the deadline was read.
 */
export function msLeft(expiresAt: string, serverOffsetMs: number, deviceNow = Date.now()): number {
  return Math.max(0, new Date(expiresAt).getTime() - (deviceNow + serverOffsetMs));
}

/** "45 minutes", "3 hours", "1 day 2 hours" — how long someone took to answer a tag. */
export function formatWait(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 3600) return plural(Math.max(1, Math.floor(s / 60)), 'minute');
  if (s < 86400) return plural(Math.floor(s / 3600), 'hour');
  const hours = Math.floor(s / 3600) % 24;
  const days = plural(Math.floor(s / 86400), 'day');
  return hours > 0 ? `${days} ${plural(hours, 'hour')}` : days;
}
