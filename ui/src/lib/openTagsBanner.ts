/**
 * The camera's open-tags message: what to do next, in the founder's words (Maximus, 2026-10-07).
 * - Downloaded Mahi themselves, never posted: "Post your first Mahi to get your first point and
 *   tag 3 mates."
 * - A mate tagged them, never posted: "You were tagged by @sam. You have 47:59:59 to post your
 *   Mahi and get your first point."
 * - Tagged after that: "@sam tagged you · 41:20:00 left", and that answering earns a point.
 * Every countdown ticks in hours, minutes and seconds (owner, 2026-10-07), on the server's clock
 * (`serverOffsetMs` = server − device). `note` is one line under the message.
 * Under 6 hours left the banner turns urgent (owner, 2026-10-07): the clock takes the warning
 * colour and the note says "Only 05:59:59 left to answer @sam." (a first post keeps its note).
 * `openTagReminder` is the in-app nudge when Mahi opens away from the camera.
 */
import { msLeft } from './countdown';
import { clockText } from './feedLock';

/** One run of text; `accent` is drawn in the accent colour (the clock, the promised point). */
export type BannerPart = { text: string; accent?: true };

export interface OpenTagsBannerContent {
  parts: BannerPart[];
  note?: string;
  /** The person has never posted (either kind of first post). */
  firstPost?: true;
  /** Under 6 hours left on the soonest tag: the clock is drawn in the warning colour. */
  urgent?: true;
}

const ANY_WORKOUT = 'Any workout counts, even 10 minutes.';

/** Less than this left on a tag and the banner turns urgent. */
export const URGENT_TAG_MS = 6 * 3600 * 1000;

/** The tag that ends first. */
function soonest<T extends { expires_at: string }>(openTags: T[]): T {
  return [...openTags].sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at))[0];
}

/** The message as one string, for VoiceOver and tests. */
export function bannerText(b: OpenTagsBannerContent): string {
  return b.parts.map((p) => p.text).join('');
}

export function openTagsBanner({
  openTags,
  serverOffsetMs,
  deviceNow = Date.now(),
  firstPost = false,
}: {
  openTags: { username: string; expires_at: string }[];
  serverOffsetMs: number;
  deviceNow?: number;
  /** Never posted (not even a deleted post). */
  firstPost?: boolean;
}): OpenTagsBannerContent | null {
  if (openTags.length === 0) {
    return firstPost
      ? {
          parts: [
            { text: 'Post your first Mahi to get ' },
            { text: 'your first point', accent: true },
            { text: ' and tag 3 mates.' },
          ],
          note: ANY_WORKOUT,
          firstPost: true,
        }
      : null;
  }
  const first = soonest(openTags);
  const others = openTags.length - 1;
  const who = `@${first.username}${others > 0 ? ` +${others}` : ''}`;
  const tags = others === 1 ? 'both' : `all ${others + 1}`;
  // The 10-minute grace after the 48 hours: never "missed" before the server says so.
  const ms = msLeft(first.expires_at, serverOffsetMs, deviceNow);
  const clock = ms > 0 ? clockText(ms) : null;
  const urgent = ms < URGENT_TAG_MS;

  if (firstPost) {
    return {
      parts: [
        { text: `You were tagged by ${who}. You have ` },
        { text: clock ?? 'only minutes', accent: true },
        { text: ' to post your Mahi and get your first point.' },
      ],
      note: others > 0 ? `One post answers ${tags} tags. ${ANY_WORKOUT}` : ANY_WORKOUT,
      firstPost: true,
      ...(urgent ? { urgent: true as const } : {}),
    };
  }
  return {
    parts: [
      { text: `${who} tagged you · ` },
      { text: clock ? `${clock} left` : 'last minutes', accent: true },
    ],
    note: urgent
      ? `Only ${clock ?? 'minutes'} left to answer @${first.username}.`
      : others > 0
        ? `One workout answers ${tags} tags and earns 1 point.`
        : 'Post your answer to earn a Mahi point.',
    ...(urgent ? { urgent: true as const } : {}),
  };
}

/**
 * The in-app nudge when Mahi opens with a tag waiting (push is off): "@sam’s tag: 05:12:33 left",
 * for the tag that ends first. At most once each time Mahi opens (`reminded`), never on the camera
 * or while posting (they already show the tag), and never over something else on screen (`quiet`:
 * the welcome cards, a tip, a sheet, another toast).
 */
export function openTagReminder({
  openTags,
  serverOffsetMs,
  deviceNow = Date.now(),
  page,
  quiet,
  reminded,
}: {
  openTags: { username: string; expires_at: string }[];
  serverOffsetMs: number;
  deviceNow?: number;
  page: string;
  quiet: boolean;
  reminded: boolean;
}): string | null {
  if (openTags.length === 0 || reminded || quiet) return null;
  if (page === 'camera' || page === 'compose') return null;
  const first = soonest(openTags);
  const ms = msLeft(first.expires_at, serverOffsetMs, deviceNow);
  return `@${first.username}’s tag: ${ms > 0 ? `${clockText(ms)} left` : 'last minutes'}`;
}
