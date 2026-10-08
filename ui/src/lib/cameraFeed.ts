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
 * The camera slid up while the feed is showing (owner, 2026-10-08: the mirror of the pull down):
 * a strip of it stays under the header, `bottom` is that strip's lower edge, `lift` how far the
 * camera has slid up to get there.
 */
export function cameraStrip(page: { width: number; height: number }, headerH: number): CameraStrip {
  const bottom = headerH + Math.round(page.height * MOTION.cameraFeed.stripShare);
  return { bottom, lift: page.height - bottom };
}

/** Where the feed's rows start: just under the camera strip. */
export function feedTop(strip: CameraStrip): number {
  return strip.bottom + SPACE.s8;
}

/**
 * On release, does the feed end up open? Past a share of the way (from wherever it started), or
 * a flick in that direction. `velocity` in pt/ms, negative = upward (towards open).
 */
export function feedOpensOnRelease(input: {
  /** 0 = camera full screen, 1 = feed showing. */
  progress: number;
  velocity: number;
  /** How far the camera travels, in points (to turn the flick into a direction). */
  travel: number;
  startedOpen: boolean;
}): boolean {
  'worklet';
  const { openAt, flick } = MOTION.cameraFeed;
  void input.travel;
  if (input.velocity <= -flick) return true;
  if (input.velocity >= flick) return false;
  return input.startedOpen ? input.progress > 1 - openAt : input.progress >= openAt;
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
  either = false,
  dx,
  dy,
}: {
  startY: number;
  insetTop: number;
  /** The feed is showing (the camera is the small card). */
  open: boolean;
  /** At the peek: either way (on to the feed, or back to the camera) is the camera's. */
  either?: boolean;
  dx: number;
  dy: number;
}): SwipeDecision {
  'worklet';
  if (startY < insetTop) return 'fail';
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > SWIPE.slop && ax >= ay) return 'fail';
  if (either) return ay > SWIPE.slop && ay > ax ? 'activate' : 'wait';
  const toward = open ? dy : -dy;
  if (toward < -SWIPE.slop) return 'fail';
  if (toward > SWIPE.slop && ay > ax) return 'activate';
  return 'wait';
}

/** A locked feed: the camera lifts this far (a quarter of the page) to show why and what to do. */
export function lockedGap(pageHeight: number): number {
  return Math.round(pageHeight * MOTION.cameraFeed.lockedShare);
}
