/**
 * Where the camera sheet settles (owner, 2026-10-09: "It gets stuck when it shouldn't"): one
 * swipe goes all the way — open, or back to the camera. Used by the pull down (roadmap), the swipe
 * up to the feed and the pull down from the feed's first post. Pure, unit-tested; a worklet, so
 * the gestures call it on the UI thread. (Until 13.39 the swipe up stopped at a peek first.)
 */
import { MOTION } from '@/constants/tokens';

export type Detent = 'closed' | 'open';

/** Where each end sits, as a share of the full travel. */
export function detentProgress(detent: Detent): number {
  'worklet';
  return detent === 'open' ? 1 : 0;
}

/**
 * Where the sheet settles when the finger lifts. `progress` is 0 (camera) to 1 (fully open);
 * `velocity` in pt/ms, positive = towards open.
 */
export function releaseDetent({
  start,
  progress,
  velocity,
}: {
  start: Detent;
  progress: number;
  velocity: number;
}): Detent {
  'worklet';
  const { openAt, flick } = MOTION.cameraFeed;
  if (start === 'closed') {
    return velocity >= flick || progress >= openAt / 2 ? 'open' : 'closed';
  }
  return velocity <= -flick || progress <= 1 - openAt ? 'closed' : 'open';
}
