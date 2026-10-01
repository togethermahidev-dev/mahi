/**
 * What the feed says about its lock (founder's rules, 2026-09-28): every post opens the feed for
 * 24 hours; after that it stays open until someone tags you; once tagged it's locked until you
 * post again; never posted = locked. The server decides; this only words it.
 * All times are measured on the server's clock (`serverOffsetMs` = server − device).
 */
import { msLeft } from './countdown';

const HOUR = 3600 * 1000;
const MINUTE = 60 * 1000;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "41 hours", "1 hour", "25 minutes"; null when the time is up. */
export function timeLeftText(ms: number): string | null {
  if (ms <= 0) return null;
  if (ms >= HOUR) return plural(Math.floor(ms / HOUR), 'hour');
  return plural(Math.ceil(ms / MINUTE), 'minute');
}

export type LockCard = { headline: string; body: string; button: string };

type Clock = { serverOffsetMs: number; deviceNow?: number };

/** The card at the top of a locked feed; null when the feed is open. */
export function lockExplainer({
  locked,
  unlockedUntil,
  openTags,
  serverOffsetMs,
  deviceNow = Date.now(),
}: Clock & {
  locked: boolean;
  /** null = never posted. */
  unlockedUntil: string | null;
  openTags: { username: string; expires_at: string }[];
}): LockCard | null {
  if (!locked) return null;

  if (openTags.length > 0) {
    const first = [...openTags].sort(
      (a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at)
    )[0];
    const others = openTags.length - 1;
    const who =
      others === 0
        ? `@${first.username}`
        : `@${first.username} and ${others} ${others === 1 ? 'other' : 'others'}`;
    const left = timeLeftText(msLeft(first.expires_at, serverOffsetMs, deviceNow));
    return {
      headline: `${who} tagged you.`,
      body: `Your feed is locked until you post your answer.${left ? ` ${left} left.` : ''}`,
      button: 'Post your answer',
    };
  }

  return {
    headline: 'Your feed is locked.',
    body: `Post ${unlockedUntil ? 'a' : 'your first'} workout to see what your friends are doing.`,
    button: 'Post a workout',
  };
}

/** The quiet line at the top of an open feed; null when locked or there's no window. */
export function feedTimerText({
  locked,
  unlockedUntil,
  serverOffsetMs,
  deviceNow = Date.now(),
}: Clock & { locked: boolean; unlockedUntil: string | null }): string | null {
  if (locked || !unlockedUntil) return null;
  const left = timeLeftText(msLeft(unlockedUntil, serverOffsetMs, deviceNow));
  return left
    ? `Your feed is open for ${left.replace(' ', ' more ')}.`
    : 'Your feed stays open until a friend tags you.';
}
