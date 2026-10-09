/**
 * Back to the camera from the full-screen feed (owner, 2026-10-09): at the first post a downward
 * drag runs the camera to feed morph (cameraFeedMorph.ts) backwards, following the finger — the
 * feed minimises as the camera grows back — and lets go open or closed by releaseDetent. Below the
 * first post the list pages as normal. At the top a "Switch to camera" pill floats over the feed
 * (owner: "when the feed reaches the top have a floating arrow circular pill that say switch to
 * camera"). Pure and unit-tested; every function is a worklet. The screen is
 * src/screens/CameraFeedPage.tsx; the gesture runs alongside the list's own (Gesture.Native).
 */
import { MOTION, SWIPE } from '@/constants/tokens';
import type { SwipeDecision } from './swipeRules';

/**
 * Whether a drag on the open feed brings the camera back: only at the first post (`atTop`, see
 * atListTop in swipeRules.ts), only downward. Up is the list paging, sideways the page swipe to
 * Messages / Profile, and a drag from the status bar is the phone's.
 */
export function feedPullDown({
  atTop,
  startY,
  insetTop,
  dx,
  dy,
}: {
  atTop: boolean;
  startY: number;
  insetTop: number;
  dx: number;
  dy: number;
}): SwipeDecision {
  'worklet';
  if (!atTop || startY < insetTop) return 'fail';
  const ax = Math.abs(dx);
  if (ax > SWIPE.slop && ax >= Math.abs(dy)) return 'fail';
  if (dy < -SWIPE.slop) return 'fail';
  if (dy > SWIPE.slop && dy > ax) return 'activate';
  return 'wait';
}

/**
 * The morph's progress (0 = camera, 1 = feed) while a finger drags it: from where it started, up
 * moves towards the feed, down towards the camera, `travel` pt the whole way.
 */
export function dragProgress(start: number, translationY: number, travel: number): number {
  'worklet';
  if (travel <= 0) return start;
  return Math.min(1, Math.max(0, start - translationY / travel));
}

/** Whether the "Switch to camera" pill floats over the feed: open, full screen, at the first post. */
export function switchPillShown(s: {
  open: boolean;
  atTop: boolean;
  locked: boolean;
  rows: boolean;
}): boolean {
  return s.open && s.atTop && !s.locked && !s.rows;
}

/** How see-through the pill is: gone over the first part of a swipe back, so never mid-morph. */
export function switchPillOpacity(progress: number, shown: boolean): number {
  'worklet';
  if (!shown) return 0;
  const fade = MOTION.cameraFeed.pillFadeShare;
  if (fade <= 0) return progress >= 1 ? 1 : 0;
  // Written from what's left of the way, so all the way open is exactly 1.
  return Math.min(1, Math.max(0, 1 - (1 - progress) / fade));
}
