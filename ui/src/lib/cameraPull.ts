/**
 * The waiting camera gives a little when pulled down (owner, 2026-10-07, #115: "it nudges down
 * only a bit and what's there displays as though it's behind it"). Pure geometry, unit-tested;
 * the gesture and the views are in src/screens/CameraScreen.tsx.
 *
 * - `verticalPull`: when a drag counts as a pull (clearly downward past SWIPE.slop) and when it
 *   is left to the sideways page swipe (swipeRules.ts), so the two never fight. A drag from the
 *   status bar is the phone's.
 * - `pullOffset`: the rubber band — the camera follows the finger less and less, never past
 *   MOTION.pull.limit.
 * - `pullParallax`: the layer behind (the waiting card) moves a share of the pull and grows from
 *   MOTION.pull.fromScale to full size, so it reads as sitting behind the glass.
 *
 * Every function is a worklet, so the gesture can call it on the UI thread.
 */
import { MOTION, SWIPE } from '@/constants/tokens';
import type { SwipeDecision } from './swipeRules';

export function verticalPull({
  startY,
  dx,
  dy,
  insetTop,
}: {
  startY: number;
  dx: number;
  dy: number;
  insetTop: number;
}): SwipeDecision {
  'worklet';
  if (startY < insetTop) return 'fail';
  const ax = Math.abs(dx);
  if (ax > SWIPE.slop && ax >= dy) return 'fail';
  if (dy < -SWIPE.slop) return 'fail';
  if (dy > SWIPE.slop && dy > ax) return 'activate';
  return 'wait';
}

/** How far the camera sits down for a finger `dy` below where it went down. */
export function pullOffset(dy: number): number {
  'worklet';
  if (dy <= 0) return 0;
  const limit = MOTION.pull.limit;
  return (limit * dy) / (dy + limit);
}

/** Where the layer behind the camera sits for a camera `offset` down. */
export function pullParallax(offset: number): { translateY: number; scale: number } {
  'worklet';
  const share = Math.min(1, Math.max(0, offset / MOTION.pull.limit));
  return {
    translateY: Math.max(0, offset) * MOTION.pull.parallax,
    scale: MOTION.pull.fromScale + (1 - MOTION.pull.fromScale) * share,
  };
}

/** The one tick per pull: once the camera passes its mark, if not yet felt this pull. */
export function pullFelt(offset: number, felt: boolean): boolean {
  'worklet';
  return !felt && offset > MOTION.pull.limit * MOTION.pullFeltAt;
}
