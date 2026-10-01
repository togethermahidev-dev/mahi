/**
 * The streak badge on a post: "Streak N", or nothing when the streak is 0. A streak counts the
 * tags answered in a row; missing a tag's 48 hours puts it back to 0.
 */
export function streakText(streak: number | null | undefined): string | null {
  return streak && streak > 0 ? `Streak ${streak}` : null;
}
