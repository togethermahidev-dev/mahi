/**
 * The line under Points · Best on your own profile. Pure and unit-tested; the screen is
 * src/screens/ProfileScreen.tsx. The rule is unchanged (#47): an answer adds a point, a miss sends
 * points back to 0, the best stays. Points can only drop on a miss, so points under the best
 * means someone came back after one.
 */
export function pointsHint(points: number | null, best: number | null): string | null {
  const p = points ?? 0;
  const b = best ?? 0;
  if (p <= 0 && b <= 0) return 'Answer your first tag to earn your first point.';
  if (p <= 0) return `Back to 0. Your best of ${b} stays. Your next answer starts you again.`;
  if (p < b) return `Back at it: your best is ${b}.`;
  return null;
}
