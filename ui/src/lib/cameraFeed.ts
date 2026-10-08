/**
 * One screen for the camera and the feed (owner, 2026-10-08): swipe the camera up and it shrinks
 * into a small card at the top-left while the feed's rows take the screen under it; tap the card,
 * the Camera pill, or swipe it down and the camera is back full screen. Pure geometry and release
 * rules, unit-tested; the screen is src/screens/CameraFeedPage.tsx.
 */
import { MOTION, SPACE, SWIPE } from '@/constants/tokens';
import type { SwipeDecision } from './swipeRules';

export type CameraCard = { x: number; y: number; width: number; height: number; scale: number };

/** Where the small camera sits when the feed is showing: its own shape, under the header, left. */
export function cameraCard(page: { width: number; height: number }, headerH: number): CameraCard {
  const { scale } = MOTION.cameraFeed;
  return {
    x: SPACE.s16,
    y: headerH + SPACE.s8,
    width: Math.round(page.width * scale),
    height: Math.round(page.height * scale),
    scale,
  };
}

/** Where the feed's rows start: just under the camera card. */
export function feedTop(card: CameraCard): number {
  return card.y + card.height + SPACE.s8;
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
