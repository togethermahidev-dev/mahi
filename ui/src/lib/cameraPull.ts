/**
 * The waiting camera is the front of a physical drawer (owner, 2026-10-08): pulling it down
 * uncovers the accountability card built behind it. Pure geometry, unit-tested;
 * the gesture and the views are in src/screens/CameraScreen.tsx.
 *
 * - `verticalPull`: when a drag counts as a pull (clearly downward past SWIPE.slop) and when it
 *   is left to the sideways page swipe (swipeRules.ts), so the two never fight. A drag from the
 *   status bar is the phone's.
 * - `drawerOffset`: the full-screen rubber band used by the actual camera drawer.
 * - `pullOffset`: the original small rubber-band helper, retained for its pure geometry contract.
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

/** A full drawer pull: follows the finger, with increasing resistance near the open position. */
export function drawerOffset(dy: number, openOffset: number): number {
  'worklet';
  if (dy <= 0 || openOffset <= 0) return 0;
  return Math.min(openOffset, dy / (1 + dy / (openOffset * 2)));
}

export function drawerShouldOpen(offset: number, openOffset: number): boolean {
  'worklet';
  return openOffset > 0 && offset >= openOffset * MOTION.pull.openAt;
}

/** Hysteresis: a short committed pull opens or closes without making the drawer feel twitchy. */
export function drawerShouldSettleOpen(
  offset: number,
  openOffset: number,
  startedOpen: boolean,
  velocityY = 0
): boolean {
  'worklet';
  const projected = Math.max(
    0,
    Math.min(openOffset, offset + velocityY * MOTION.pull.projectionMs)
  );
  if (!startedOpen) return drawerShouldOpen(projected, openOffset);
  return projected > openOffset * (1 - MOTION.pull.openAt);
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
