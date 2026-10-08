/**
 * The camera's open-tags message: what to do next, in the founder's words (Maximus, 2026-10-07).
 * - Downloaded Mahi themselves, never posted: their one free check-in needs no tag.
 * - A mate tagged them, never posted: "You were tagged by @sam. You have 47:59:59 to post your
 *   Mahi and get your first point."
 * - Tagged after that: "@sam is waiting on you · 41:20:00 left", and what answering earns and a
 *   miss costs: "Answer to earn a point. Miss it and your 4 points go back to 0." (usability
 *   walkthrough, 2026-10-07; at 0 points only the first sentence).
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
  points = null,
}: {
  openTags: { username: string; expires_at: string }[];
  serverOffsetMs: number;
  deviceNow?: number;
  /** Never posted (not even a deleted post). */
  firstPost?: boolean;
  /** Your Mahi points now (null until loaded): what a miss would cost. */
  points?: number | null;
}): OpenTagsBannerContent | null {
  if (openTags.length === 0) {
    return firstPost
      ? {
          parts: [
            { text: 'Show up with your first workout to earn ' },
            { text: 'your first point', accent: true },
            { text: '.' },
          ],
          note: ANY_WORKOUT,
          firstPost: true,
        }
      : null;
  }
  const first = soonest(openTags);
  const others = openTags.length - 1;
  const who = `@${first.username}${others > 0 ? ` and ${others} more` : ''}`;
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
  const p = points ?? 0;
  const lose =
    p > 0
      ? ` Miss ${others > 0 ? 'one' : 'it'} and your ${p === 1 ? '1 point goes' : `${p} points go`} back to 0.`
      : '';
  return {
    parts: [
      { text: `${who} ${others > 0 ? 'are' : 'is'} waiting on you · ` },
      { text: clock ? `${clock} left` : 'last minutes', accent: true },
    ],
    note: urgent
      ? `Only ${clock ?? 'minutes'} left to answer @${first.username}.`
      : others > 0
        ? `One workout answers ${tags} tags and earns a point.${lose}`
        : `Answer to earn a point.${lose}`,
    ...(urgent ? { urgent: true as const } : {}),
  };
}

/** "@a", "@a and @b", "@a, @b and @c", "@a, @b, @c and 2 more". */
export function namesList(usernames: string[]): string {
  const names = usernames.slice(0, 3).map((u) => `@${u}`);
  const more = usernames.length - names.length;
  if (more > 0) return `${names.join(', ')} and ${more} more`;
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The waiting camera while your own tags are running (usability walkthrough, 2026-10-07): "Your
 * mates are on the clock" / "@a, @b and @c have 31:12:00 to answer you." on the soonest clock.
 * `mates` comes from get_mates_on_clock (never kept on the phone). Null when nobody is on the
 * clock: the card keeps "Waiting for a friend to tag you".
 */
export function matesOnClock({
  mates,
  serverOffsetMs,
  deviceNow = Date.now(),
}: {
  mates: { username: string; expires_at: string }[];
  serverOffsetMs: number;
  deviceNow?: number;
}): { title: string; line: string } | null {
  if (mates.length === 0) return null;
  const sorted = [...mates].sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
  const names = namesList(sorted.map((m) => m.username));
  const have = sorted.length === 1 ? 'has' : 'have';
  const ms = msLeft(sorted[0].expires_at, serverOffsetMs, deviceNow);
  return {
    title: 'Your friends are on the clock',
    line:
      ms > 0
        ? `${names} ${have} ${clockText(ms)} to answer you.`
        : `${names} ${have} only minutes left to answer you.`,
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
