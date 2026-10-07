/**
 * Mahi points (founder, 2026-10-02): each post that answers at least one tag earns 1 point;
 * missing a tag's 48 hours puts your points back to 0; your best is never lowered. Not a streak
 * ("streaks are a daily thing") — the word streak is never shown. The server keeps the number in
 * profiles.streak_current / streak_highest and posts.streak_day (names kept for older apps).
 */
import { namesList } from './openTagsBanner';

/** "1 point", "12 points" (unknown reads as 0). */
export function pointsCount(points: number | null | undefined): string {
  const n = points ?? 0;
  return `${n} ${n === 1 ? 'point' : 'points'}`;
}

/** "1 Mahi point", "12 Mahi points" (unknown reads as 0): the one full wording for the points. */
export function mahiPointsCount(points: number | null | undefined): string {
  const n = points ?? 0;
  return `${n} Mahi ${n === 1 ? 'point' : 'points'}`;
}

/**
 * The badge on a post (feed, full-screen post, profile grid): its poster's points after that post,
 * named in full so "12 points" can't be read as a score for the photo; nothing at 0.
 */
export function pointsBadgeText(points: number | null | undefined): string | null {
  return points && points > 0 ? mahiPointsCount(points) : null;
}

/** What VoiceOver reads for the profile's Points / Best pair. */
export function pointsStatsLabel(
  points: number | null | undefined,
  best: number | null | undefined
): string {
  return `${mahiPointsCount(points)}. Best, ${pointsCount(best)}.`;
}

/**
 * The number on the camera and profile: a dash until it has loaded, so a 0 never shows and then
 * changes (owner rule: never show data that then swaps).
 */
export function pointsValue(points: number | null | undefined): string {
  return points === null || points === undefined ? '–' : String(points);
}

/** Answers in a row without a miss that get their own toast line (what points count). */
const ROUND_NUMBERS = [5, 10, 25, 50, 100];
/** How close to your best (in points) before the toast counts down to beating it. */
const NEAR_BEST = 3;

/** "You tagged 3 mates", "You tagged 1 mate and 2 people by link"; null with no tags. */
function taggedLine({ friends, links }: { friends: number; links: number }): string | null {
  const byLink = `${links} ${links === 1 ? 'person' : 'people'} by link`;
  if (friends > 0) {
    const named = `${friends} ${friends === 1 ? 'mate' : 'mates'}`;
    return `You tagged ${links > 0 ? `${named} and ${byLink}` : named}.`;
  }
  return links > 0 ? `You tagged ${byLink}.` : null;
}

/**
 * Whether a post's points are a milestone the toast celebrates with its own line: the first point,
 * a new best, or 5 / 10 / 25 / 50 / 100 answers without a miss. `points` is the total after the
 * post, `bestBefore` the best before it (null = unknown, as in `postedToast`). Felt as a small
 * success buzz (`postedMoments` in haptics.ts).
 */
export function pointsMilestone(points: number | null, bestBefore: number | null): boolean {
  if (points === null || bestBefore === null) return false;
  return points > bestBefore || ROUND_NUMBERS.includes(points);
}

/**
 * The toast after every post. A post that answers no tag (the first post) opens the feed for 24
 * hours (#29) and says who it tagged; one that answers at least one tag earns one point (#47),
 * however many it answers. `points` is the total after the post (null when the server sent none);
 * `bestBefore` the best before it. Points count answers since the last miss, so a reset shows as
 * 1 with a best above 0 ("Welcome back"); round numbers and nearing the best get their own words.
 * No speed, no streak.
 */
export function postedToast({
  answered,
  points,
  bestBefore,
  tagged,
}: {
  answered: string[];
  points: number | null;
  bestBefore: number | null;
  /** What this post tagged: friends (in-app requests too) and people sent a link. */
  tagged?: { friends: number; links: number };
}): string {
  if (answered.length === 0) {
    const line = tagged ? taggedLine(tagged) : null;
    return `Posted.${line ? ` ${line}` : ''} Your feed is open for 24 hours.`;
  }
  const others = answered.length - 1;
  const more = others > 0 ? ` and ${others} ${others === 1 ? 'other' : 'others'}` : '';
  const who = `Answered @${answered[0]}${more}.`;
  if (points === null) return `${who} +1 Mahi point.`;
  if (bestBefore === 0 && points === 1) return `${who} You earned your first Mahi point.`;
  if (bestBefore === null) return `${who} +1 Mahi point. You have ${points}.`;
  if (points > bestBefore) return `${who} +1 Mahi point. New best: ${points}.`;
  // Back from a miss: a fresh start, without a reminder of what was lost.
  if (points === 1) return `${who} Welcome back. +1 Mahi point.`;
  if (ROUND_NUMBERS.includes(points)) {
    return `${who} +1 Mahi point. That’s ${points} answers without a miss.`;
  }
  if (points === bestBefore) return `${who} +1 Mahi point. That’s your best again: ${points}.`;
  if (bestBefore - points <= NEAR_BEST) {
    return `${who} +1 Mahi point. ${bestBefore - points + 1} more to beat your best.`;
  }
  return `${who} +1 Mahi point. You have ${points}.`;
}

/**
 * The full-screen moment after a post that earns a Mahi point (owner, 2026-10-07: "gamified, and
 * say what it means"). Every first post earns the first point (`20261007180000_first_post_point`),
 * and it teaches reactive posting; a later answer shows +1 and the total. null when no point was
 * earned (a post that answered nothing after the first).
 */
export function pointCelebration({
  answered,
  points,
  bestBefore,
  firstPost,
  tagged,
}: {
  /** Usernames whose tags this post answered. */
  answered: string[];
  /** Points after the post. */
  points: number;
  /** The best before the post. */
  bestBefore: number;
  /** This was the person's first ever post. */
  firstPost: boolean;
  /**
   * What this post tagged: mates on Mahi, and invite links still to send. `names`: the mates whose
   * 48 hours start now, named in the line (usability walkthrough, 2026-10-07).
   */
  tagged: { friends: number; links: number; names?: string[] };
}): { title: string; total: string; lines: string[] } | null {
  if (!firstPost && answered.length === 0) return null;
  const total = `You have ${mahiPointsCount(points)}.`;
  const others = answered.length - 1;
  const more = others > 0 ? ` and ${others} ${others === 1 ? 'other' : 'others'}` : '';
  // A link's 48 hours only start once that mate joins, so links get their own line.
  const { friends, links, names = [] } = tagged;
  const onClock =
    names.length > 0
      ? `${namesList(names)} now ${names.length === 1 ? 'has' : 'have'} 48 hours to answer you.`
      : friends > 0
        ? `Your ${friends} ${friends === 1 ? 'mate has' : 'mates have'} 48 hours to answer you.`
        : null;
  const mates = [
    onClock,
    links > 0
      ? `Send your ${links} ${links === 1 ? 'link' : 'links'} next. Each mate gets 48 hours once they join.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  if (firstPost) {
    const answeredLine = answered.length > 0 ? `You answered @${answered[0]}’s tag${more}.` : null;
    // The first post also opens the feed (the toast that used to say so is replaced by this).
    const first = [answeredLine, mates, 'Your feed is open for 24 hours.']
      .filter(Boolean)
      .join(' ');
    return {
      title: 'Your first Mahi point!',
      total,
      lines: [
        ...(first ? [first] : []),
        'From now on you post when a mate tags you. Answer each tag within 48 hours for another point.',
        'Miss a tag and your points go back to 0. Your best stays.',
      ],
    };
  }
  const keepGoing = 'Keep answering every tag to grow your points.';
  return {
    title: points > bestBefore ? `New best: ${points} Mahi points!` : '+1 Mahi point',
    total,
    lines: [
      `You answered @${answered[0]}${more}.`,
      ...(names.length > 0 && mates ? [mates] : []),
      points === 1 && bestBefore > 0 ? `Welcome back. ${keepGoing}` : keepGoing,
    ],
  };
}

/**
 * The full-screen moment on the next open after a miss (usability walkthrough, 2026-10-07), in
 * PointCelebration's style: whose tag, that the points are back to 0 and the best stays, and how
 * to start again. Shown once per miss (the `streak_lost` notification); the server only sends one
 * when there were points to lose.
 */
export function missMoment({ tagger, best }: { tagger: string; best: number | null }): {
  title: string;
  total: string;
  lines: string[];
  badge: string;
  badgeLabel: string;
} {
  return {
    title: `You missed @${tagger}’s tag`,
    total: `Your points are back to 0. Your best${best && best > 0 ? ` of ${best}` : ''} stays.`,
    lines: ['Post when a mate tags you to start again.'],
    badge: '0',
    badgeLabel: 'Mahi points back to 0',
  };
}

/** The points row on the camera's waiting card: "4 Mahi points · Best 6"; null until loaded. */
export function pointsRowText(points: number | null, best: number | null): string | null {
  if (points === null) return null;
  return `${mahiPointsCount(points)} · Best ${best ?? 0}`;
}

/**
 * The last three mates whose tags you answered, newest first, each once (the profile's points
 * card: your points are made of people). From your own posts' `response`, read fresh with them.
 */
export function lastAnsweredMates(
  posts: { created_at: string; response?: { tagger_username: string } | null }[]
): string[] {
  const names: string[] = [];
  const newestFirst = [...posts].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
  for (const p of newestFirst) {
    const name = p.response?.tagger_username;
    if (name && !names.includes(name)) names.push(name);
    if (names.length === 3) break;
  }
  return names;
}

/** "Your last answers: @sam, @jo and @al"; null before your first answer. */
export function answeredMatesLine(usernames: string[]): string | null {
  if (usernames.length === 0) return null;
  return `Your last ${usernames.length === 1 ? 'answer' : 'answers'}: ${namesList(usernames)}`;
}
