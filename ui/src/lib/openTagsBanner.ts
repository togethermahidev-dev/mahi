/**
 * The camera's open-tags pill: who tagged you, and the time left on the soonest deadline in the
 * same words as the feed ("41 hours left", minutes in the last hour) — not a ticking clock.
 * Measured on the server's clock (`serverOffsetMs` = server − device). Someone who has never
 * posted sees "First post · no tag needed" in the same pill instead of a bare camera.
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
  /** Never posted and the camera is open: the first post needs no tag, so the pill says so. */
  firstPost?: boolean;
}): { who: string; left: string; firstPost?: true } | null {
  if (openTags.length === 0) {
    return firstPost ? { who: 'First post', left: 'no tag needed', firstPost: true } : null;
  }
  const first = [...openTags].sort(
    (a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at)
  )[0];
  const others = openTags.length - 1;
  const time = timeLeftText(msLeft(first.expires_at, serverOffsetMs, deviceNow));
  return {
    who: `@${first.username}${others > 0 ? ` +${others}` : ''}`,
    left: time ? `${time} left` : 'time is up',
  };
}
