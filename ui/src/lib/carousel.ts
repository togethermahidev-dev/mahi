/**
 * Shared carousel maths. Kept SDK-free so snapping and edge cases stay unit-tested independently
 * from React Native's ScrollView.
 */

/** The nearest card after a horizontal carousel settles, clamped to the available cards. */
export function carouselIndex(
  offsetX: number,
  itemWidth: number,
  gap: number,
  count: number
): number {
  if (count <= 0 || itemWidth <= 0) return 0;
  const interval = itemWidth + gap;
  if (interval <= 0) return 0;
  return Math.min(Math.max(Math.round(offsetX / interval), 0), count - 1);
}

/** What VoiceOver reads with the page dots. */
export function carouselPositionLabel(index: number, count: number): string {
  return `Card ${index + 1} of ${count}`;
}
