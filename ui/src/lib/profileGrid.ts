/**
 * A profile's grid of posts (owner, 2026-10-10: three across): squares edge to edge, with the gap
 * between squares only, none at the screen's edges. Pure, so it runs under the node-only tests;
 * the list is src/components/ProfileMediaMap.tsx, the counts are PROFILE in the tokens.
 */

/** One square's side: the width shared out after the gaps between the squares. */
export function gridSquare(width: number, columns: number, gap: number): number {
  return (width - gap * (columns - 1)) / columns;
}

/**
 * How far a post's square starts from the left of its column. The list gives every column the
 * same share of the row (width / columns), which is a little wider than a square, so each column
 * after the first starts a little further in: that is what puts the whole gap between squares.
 */
export function gridInset(index: number, columns: number, gap: number): number {
  return ((index % columns) * gap) / columns;
}
