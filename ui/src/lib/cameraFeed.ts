/**
 * One screen for the camera and the feed (owner, 2026-10-08): the camera is the front sheet. Swipe
 * it up and it slides up, leaving a strip under the header, with the feed behind it (the mirror
 * of the pull down); tap the strip, the Camera pill, or swipe it down and the camera is back. Pure geometry and release
 * rules, unit-tested; the screen is src/screens/CameraFeedPage.tsx.
 */
import { MOTION, SPACE, SWIPE } from '@/constants/tokens';
import type { SwipeDecision } from './swipeRules';

export type CameraStrip = { bottom: number; lift: number };

/**
 * The camera slid up while the feed is fully showing (owner, 2026-10-08: "all the way up"): the
 * whole camera slides off the top (`lift` = the page height) and the feed fills the page under its
 * own header (`bottom` = the header's lower edge, where the rows begin).
 */
export function cameraStrip(page: { width: number; height: number }, headerH: number): CameraStrip {
  return { bottom: headerH, lift: page.height };
}

/** Where the feed's rows start: just under the camera strip. */
export function feedTop(strip: CameraStrip): number {
  return strip.bottom + SPACE.s8;
}

/**
 * Whether a drag on the camera moves the feed: up on the full camera, down on the small card.
 * Decided by direction, like the camera's pull (cameraPull.ts): a sideways drag is the page swipe
 * to Messages / Profile, the other direction belongs to the camera's own pull, and a drag from
 * the status bar is the phone's.
 */
export function feedSwipe({
  startY,
  insetTop,
  open,
  dx,
  dy,
}: {
  startY: number;
  insetTop: number;
  /** The feed is showing (the camera is the small card). */
  open: boolean;
  dx: number;
  dy: number;
}): SwipeDecision {
  'worklet';
  if (startY < insetTop) return 'fail';
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > SWIPE.slop && ax >= ay) return 'fail';
  const toward = open ? dy : -dy;
  if (toward < -SWIPE.slop) return 'fail';
  if (toward > SWIPE.slop && ay > ax) return 'activate';
  return 'wait';
}

/** A locked feed: the camera lifts this far (a quarter of the page) to show why and what to do. */
export function lockedGap(pageHeight: number): number {
  return Math.round(pageHeight * MOTION.cameraFeed.lockedShare);
}
