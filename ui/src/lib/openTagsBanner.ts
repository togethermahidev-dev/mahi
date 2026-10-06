/**
 * The camera's open-tags pill: who tagged you, and the time left on the soonest deadline in the
 * same words as the feed ("41 hours left", minutes in the last hour) — not a ticking clock.
 * Measured on the server's clock (`serverOffsetMs` = server − device). Someone who has never
 * posted sees "First post · no tag needed" in the same pill instead of a bare camera.
 *
 * `note` is one line under the pill: a newcomer answering their first tag hears that any workout
 * counts; someone tagged by several friends hears that one post answers them all (the server marks
 * every open tag answered by one post).
 */
import { msLeft } from './countdown';
import { timeLeftText } from './feedLock';

export function openTagsBanner({
  openTags,
  serverOffsetMs,
  deviceNow = Date.now(),
  firstPost = false,
}: {
  openTags: { username: string; expires_at: string }[];
  serverOffsetMs: number;
  deviceNow?: number;
  /** Never posted: with no tag the pill says the first post needs none; with one, a note. */
  firstPost?: boolean;
}): { who: string; left: string; firstPost?: true; note?: string } | null {
  if (openTags.length === 0) {
    return firstPost
      ? {
          who: 'First post',
          left: 'no tag needed',
          firstPost: true,
          note: 'Any workout counts, even 10 minutes.',
        }
      : null;
  }
  const first = [...openTags].sort(
    (a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at)
  )[0];
  const others = openTags.length - 1;
  const time = timeLeftText(msLeft(first.expires_at, serverOffsetMs, deviceNow));
  const note = firstPost
    ? 'Your first post. Any workout counts, even 10 minutes.'
    : others > 0
      ? `One workout answers ${others === 1 ? 'both' : `all ${others + 1}`} tags.`
      : undefined;
  return {
    who: `@${first.username}${others > 0 ? ` +${others}` : ''}`,
    // The 10-minute grace after the 48 hours: never "missed" before the server says so.
    left: time ? `${time} left` : 'last minutes',
    ...(note ? { note } : {}),
  };
}
