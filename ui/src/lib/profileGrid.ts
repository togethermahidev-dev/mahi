/**
 * A profile's grid of posts (owner, 2026-10-10: three across, each tile a little taller than it is
 * wide): tiles edge to edge, with the gap between them only, none at the screen's edges. Pure, so it runs under the node-only tests;
 * the list is src/components/ProfileMediaMap.tsx, the counts are PROFILE in the tokens.
 */
import { namesList } from './openTagsBanner';
import { INVITE_BUTTON } from './tagSlots';

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

/** A tile's height: its width made a little taller (`PROFILE.gridTileTall`). */
export function gridTileHeight(width: number, tall: number): number {
  return width * tall;
}

/**
 * The quiet line under the last post, so a short grid doesn't just trail off into blank space
 * (owner, 2026-10-10). Null while more may come, and for an empty grid, which has its own state.
 */
export function gridEndLine({
  isSelf,
  username,
  count,
  hasMore,
  loading,
}: {
  isSelf: boolean;
  username: string | null | undefined;
  count: number;
  hasMore: boolean;
  loading: boolean;
}): string | null {
  if (count === 0 || hasMore || loading) return null;
  if (isSelf) return 'That’s all your workouts so far.';
  return username
    ? `That’s all of @${username}’s workouts so far.`
    : 'That’s all their workouts so far.';
}

/**
 * Under your own grid: your next step in the loop, and where its button takes you (owner,
 * 2026-10-10: "have an action that takes them to someone depending what they need to do").
 * - Tagged: who tagged you, and the camera to post.
 * - Not tagged: you post when a friend tags you, so the step is to bring a friend in.
 * Tags are picked while posting, so "tag someone" is never a step of its own here. Null until the
 * tags have been read: never a guess that then changes.
 */
export function ownNextStep({
  tagsLoaded,
  taggers,
}: {
  tagsLoaded: boolean;
  /** Usernames of the people whose tags are still open, soonest first. */
  taggers: string[];
}): { line: string; button: string; go: 'camera' | 'invite' } | null {
  if (!tagsLoaded) return null;
  if (taggers.length > 0) {
    return { line: `${namesList(taggers)} tagged you.`, button: 'Post your Mahi', go: 'camera' };
  }
  return { line: 'You post when a friend tags you.', button: INVITE_BUTTON, go: 'invite' };
}
