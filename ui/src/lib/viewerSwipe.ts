/**
 * The post viewer's two moves (owner, 2026-10-10: "change it to scroll up/down to go between them
 * and make swiping left or right be able to exit (switch how it currently is)"):
 * - up and down pages between the posts, one per screen, with the feed's snap
 *   (`fullScreenPaging` in feedListLayout.ts); one post on its own doesn't move;
 * - a clear sideways swipe, either way, closes it, the close animation following the finger.
 * Pure and unit-tested; the gesture ones are worklets, called on the UI thread from
 * src/components/PostViewer.tsx. Distances in px, speeds in px per second (as gesture-handler
 * reports them). When a sideways drag starts is the viewer's own gesture setting (SWIPE.slop).
 */
import { VIEWER } from '@/constants/tokens';

/** What the viewer shows: a profile's posts, the feed, or one post (shared in a chat). */
export type ViewerFrom = 'profile' | 'feed' | 'post';

/** Whether up and down moves between posts. One post on its own stays put. */
export function viewerPages(from: ViewerFrom): boolean {
  return from !== 'post';
}

/**
 * Whether letting go of a sideways drag closes the viewer: dragged far enough either way, or
 * flicked the way it was dragged. A flick back towards the middle keeps it open.
 */
export function sidewaysCloses(dx: number, vx: number): boolean {
  'worklet';
  if (Math.abs(vx) > VIEWER.closeVelocity) return dx * vx > 0;
  return Math.abs(dx) > VIEWER.closeDistance;
}

/**
 * The close animation while a finger drags sideways: 1 (open) down to 0 (closed) over one screen
 * width, either way. It drives the same transition the close button plays.
 */
export function sidewaysProgress(dx: number, width: number): number {
  'worklet';
  if (width <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - Math.abs(dx) / width));
}

/** Where the post slides off to once a sideways drag closes it: the side it was dragged to. */
export function sidewaysExit(dx: number, width: number): number {
  'worklet';
  return dx < 0 ? -width : width;
}
