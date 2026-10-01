/**
 * What the feed says about its lock (founder's rules, 2026-10-01). Reactive posting: you post
 * only to answer a friend's open tag (except your first post). Every post opens the feed for 24 hours; tagged within
 * them, it locks when they end; if not, it stays open until you're tagged, then locks. Miss a tag
 * and it stays locked until a friend tags you again. Never posted = locked.
 * The server decides; this only words it.
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

/** No button when reactive posting leaves nothing to post yet (posted before, no open tag). */
export type LockCard = { headline: string; body: string; button?: string };

type Clock = { serverOffsetMs: number; deviceNow?: number };
type OpenTags = { username: string; expires_at: string }[];

/** "@sam", "@sam and 1 other", "@sam and 2 others" — led by the tag that runs out first. */
function whoTagged(openTags: OpenTags): { who: string; first: OpenTags[number] } {
  const first = [...openTags].sort(
    (a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at)
  )[0];
  const others = openTags.length - 1;
  const who =
    others === 0
      ? `@${first.username}`
      : `@${first.username} and ${others} ${others === 1 ? 'other' : 'others'}`;
  return { who, first };
}

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
  openTags: OpenTags;
}): LockCard | null {
  if (!locked) return null;

  if (openTags.length > 0) {
    const { who, first } = whoTagged(openTags);
    const left = timeLeftText(msLeft(first.expires_at, serverOffsetMs, deviceNow));
    return {
      headline: `${who} tagged you.`,
      body: `Your feed is locked until you post your answer.${left ? ` ${left} left.` : ''}`,
      button: 'Post your answer',
    };
  }

  if (unlockedUntil) {
    return { headline: 'Your feed is locked.', body: 'You can post again when a friend tags you.' };
  }
  return {
    headline: 'Your feed is locked.',
    body: 'Post your first workout to see what your friends are doing.',
    button: 'Post a workout',
  };
}

/** The words on a friend's post while your feed is locked; a button only when you can post. */
export function lockedPostText({
  tagged,
  postedBefore,
}: {
  /** You have an open tag to answer. */
  tagged: boolean;
  postedBefore: boolean;
}): { hint: string; button?: string } {
  if (tagged) return { hint: 'Answer a tag to see it', button: 'Post your answer' };
  if (!postedBefore) return { hint: 'Post your first workout to see it', button: 'Post to unlock' };
  return { hint: 'Answer a tag to see it' };
}

/** The quiet line at the top of an open feed; null when locked or there's no window. */
export function feedTimerText({
  locked,
  unlockedUntil,
  openTags,
  serverOffsetMs,
  deviceNow = Date.now(),
}: Clock & { locked: boolean; unlockedUntil: string | null; openTags: OpenTags }): string | null {
  if (locked || !unlockedUntil) return null;
  const left = timeLeftText(msLeft(unlockedUntil, serverOffsetMs, deviceNow));
  if (openTags.length > 0) {
    const { who } = whoTagged(openTags);
    return `${who} tagged you. Your feed locks ${left ? `in ${left} ` : ''}unless you post your answer.`;
  }
  return left
    ? `Your feed is open for ${left.replace(' ', ' more ')}.`
    : 'Your feed stays open until a friend tags you.';
}
