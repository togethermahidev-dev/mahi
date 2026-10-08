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

/**
 * Every locked card has one button. `target` says where it goes: the camera when there's
 * something to post, or people search when there isn't (posted before, no open tag).
 */
export type LockCard = {
  headline: string;
  body: string;
  button: string;
  target: 'camera' | 'friends';
};

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
    // A ticking clock, like every tag countdown (owner, 2026-10-07).
    const ms = msLeft(first.expires_at, serverOffsetMs, deviceNow);
    const left = ms > 0 ? clockText(ms) : null;
    return {
      headline: `${who} tagged you.`,
      body: `Your feed is locked until you post your answer.${left ? ` ${left} left.` : ''}`,
      button: 'Post your answer',
      target: 'camera',
    };
  }

  // Nothing to post yet: the way out is more friends, since more friends means more tags.
  if (unlockedUntil) {
    return {
      headline: 'Ready for your next workout?',
      body: 'A friend’s tag unlocks your next check-in. Find accountability partners who will call you to show up.',
      button: 'Find accountability partners',
      target: 'friends',
    };
  }
  return {
    headline: 'Your first move: show up.',
    body: 'Post one workout to earn your first point and open your feed. Any movement counts.',
    button: 'Start first workout',
    target: 'camera',
  };
}

/**
 * The one small pill over a locked feed (owner, 2026-10-08: the real rows, blurred, with a pill
 * saying why and what to do; no big card). Null while the feed is open.
 */
export function lockPill(
  input: Parameters<typeof lockExplainer>[0]
): { line: string; button: string; target: LockCard['target'] } | null {
  const card = lockExplainer(input);
  if (!card) return null;
  if (input.openTags.length > 0) {
    const { who, first } = whoTagged(input.openTags);
    const ms = msLeft(first.expires_at, input.serverOffsetMs, input.deviceNow ?? Date.now());
    const left = ms > 0 ? ` ${clockText(ms)} left.` : '';
    return { line: `Locked. Answer ${who} to open it.${left}`, button: card.button, target: 'camera' };
  }
  if (input.unlockedUntil) {
    return { line: 'Locked until a friend tags you.', button: 'Find friends', target: 'friends' };
  }
  return {
    line: 'Locked. Post your first workout to open it.',
    button: card.button,
    target: 'camera',
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
  if (tagged) return { hint: 'Opens when you post your answer', button: 'Post your answer' };
  if (!postedBefore)
    return { hint: 'Show up with your first workout to see it', button: 'Start first workout' };
  return { hint: 'Opens when a friend tags you' };
}

/** A live countdown, "05:12:33": hours, minutes and seconds, two digits each; a part second
 *  rounds up, so it reads 00:00:00 only when the time is up. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(Math.floor(total / 3600))}:${two(Math.floor(total / 60) % 60)}:${two(total % 60)}`;
}

/**
 * The countdown at the top of an open feed (founder, 2026-10-05: a live timer in the camera
 * banner's style, not a line of hours). `label` sits before the clock; `ms` is what the clock
 * counts down, or null when there is no clock (the 24 hours are over); `spoken` is the same in
 * words for VoiceOver, minute by minute. Null when locked or there's no window.
 */
export function feedCountdown({
  locked,
  unlockedUntil,
  openTags,
  serverOffsetMs,
  deviceNow = Date.now(),
}: Clock & { locked: boolean; unlockedUntil: string | null; openTags: OpenTags }): {
  label: string;
  ms: number | null;
  spoken: string;
} | null {
  if (locked || !unlockedUntil) return null;
  const ms = msLeft(unlockedUntil, serverOffsetMs, deviceNow);
  const left = timeLeftText(ms);
  if (openTags.length > 0) {
    const { who } = whoTagged(openTags);
    if (!left) {
      const line = `${who} tagged you. Your feed locks unless you post your answer.`;
      return { label: line, ms: null, spoken: line };
    }
    return {
      label: 'Feed will lock in',
      ms,
      spoken: `${who} tagged you. Feed will lock in ${left} unless you post your answer.`,
    };
  }
  if (!left) {
    const line = 'Your feed is open. It will lock when a friend tags you.';
    return { label: line, ms: null, spoken: line };
  }
  return {
    // With no tag waiting, the server guarantees this much open time but does not lock at zero:
    // after the window ends, the next incoming tag locks it. Never promise a lock that may not fire.
    label: 'Feed open · next tag locks it after',
    ms,
    spoken: `Feed open. The next tag locks it after ${left}.`,
  };
}
