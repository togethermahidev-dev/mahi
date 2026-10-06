/**
 * Mahi points (founder, 2026-10-02): each post that answers at least one tag earns 1 point;
 * missing a tag's 48 hours puts your points back to 0; your best is never lowered. Not a streak
 * ("streaks are a daily thing") — the word streak is never shown. The server keeps the number in
 * profiles.streak_current / streak_highest and posts.streak_day (names kept for older apps).
 */

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

/** "You tagged 3 friends", "You tagged 1 friend and 2 people by link"; null with no tags. */
function taggedLine({ friends, links }: { friends: number; links: number }): string | null {
  const byLink = `${links} ${links === 1 ? 'person' : 'people'} by link`;
  if (friends > 0) {
    const named = `${friends} ${friends === 1 ? 'friend' : 'friends'}`;
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
