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

/** The badge on a post: its poster's points after that post, or nothing at 0. */
export function pointsBadgeText(points: number | null | undefined): string | null {
  return points && points > 0 ? pointsCount(points) : null;
}

/** What VoiceOver reads for the profile's Points / Best pair. */
export function pointsStatsLabel(
  points: number | null | undefined,
  best: number | null | undefined
): string {
  const n = points ?? 0;
  return `${n} Mahi ${n === 1 ? 'point' : 'points'}. Best, ${pointsCount(best)}.`;
}
