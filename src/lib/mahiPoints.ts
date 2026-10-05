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

/**
 * The toast after every post. A post that answers no tag (the first post) opens the feed for 24
 * hours (#29); one that answers at least one tag earns one point (#47), however many it answers.
 * `points` is the total after the post (null when the server sent none); `bestBefore` the best
 * before it. No speed, no streak.
 */
export function postedToast({
  answered,
  points,
  bestBefore,
}: {
  answered: string[];
  points: number | null;
  bestBefore: number | null;
}): string {
  if (answered.length === 0) return 'Posted. Your feed is open for 24 hours.';
  const others = answered.length - 1;
  const more = others > 0 ? ` and ${others} ${others === 1 ? 'other' : 'others'}` : '';
  const who = `Answered @${answered[0]}${more}.`;
  if (points === null) return `${who} +1 Mahi point.`;
  if (bestBefore === 0 && points === 1) return `${who} You earned your first Mahi point.`;
  if (bestBefore !== null && bestBefore >= 1 && points > bestBefore) {
    return `${who} +1 Mahi point. New best: ${points}.`;
  }
  return `${who} +1 Mahi point. You have ${points}.`;
}
