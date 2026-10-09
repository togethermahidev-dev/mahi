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

/** Tagged and locked out (core workflow step 17): "You've been tagged. Post your Mahi to access
 *  your feed". */
const TAGGED_HEADLINE = 'You’ve been tagged.';
const TAGGED_LINE = 'Post your Mahi to access your feed.';

/** " 41:30:00 left." on the tag that runs out first; '' once its time is up. */
function tagClock(openTags: OpenTags, serverOffsetMs: number, deviceNow: number): string {
  const ms = msLeft(whoTagged(openTags).first.expires_at, serverOffsetMs, deviceNow);
  return ms > 0 ? ` ${clockText(ms)} left.` : '';
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
    // Core workflow step 17 (owner, 2026-10-09), then a ticking clock for the tag that runs out
    // first, like every tag countdown (owner, 2026-10-07).
    const left = tagClock(openTags, serverOffsetMs, deviceNow);
    return {
      headline: TAGGED_HEADLINE,
      body: `${TAGGED_LINE}${left}`,
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
  input: Parameters<typeof lockExplainer>[0] & {
    /** The server's "has posted before" mark: when true, never ask for a first workout, even if
     *  none of your posts is in the feed any more (owner, 2026-10-08). */
    postedBefore?: boolean;
  }
): { line: string; button: string; target: LockCard['target'] } | null {
  const card = lockExplainer(input);
  if (!card) return null;
  if (input.openTags.length > 0) {
    const left = tagClock(input.openTags, input.serverOffsetMs, input.deviceNow ?? Date.now());
    return {
      line: `${TAGGED_HEADLINE} ${TAGGED_LINE}${left}`,
      button: card.button,
      target: 'camera',
    };
  }
  if (input.unlockedUntil || input.postedBefore) {
    return { line: 'Locked until a friend tags you.', button: 'Find friends', target: 'friends' };
  }
  return {
    line: 'Locked. Post your first workout to open it.',
    button: card.button,
    target: 'camera',
  };
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

/**
 * What the panel under a lifted, locked camera says (owner, 2026-10-09: it showed an empty grey
 * panel while the tags hadn't been read). Never blank: the reason and its button once the tags
 * are read; "Checking your tags…" while they load; "Couldn’t reach Mahi." with Try again when the
 * read failed. The same words as the camera's own loading and offline states.
 */
export function lockedGapContent({
  pill,
  loaded,
  error,
}: {
  pill: ReturnType<typeof lockPill>;
  loaded: boolean;
  error: boolean;
}): { line: string; button: string | null; action: LockCard['target'] | 'retry' | null } {
  if (loaded && pill) return { line: pill.line, button: pill.button, action: pill.target };
  if (error) return { line: 'Couldn’t reach Mahi.', button: 'Try again', action: 'retry' };
  return { line: 'Checking your tags…', button: null, action: null };
}
