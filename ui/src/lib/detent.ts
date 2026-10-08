/**
 * Two-stage swipes for the camera sheet (owner, 2026-10-08): the first swipe nudges it to a short
 * peek; a second swipe, or a tap, goes the rest. Swiping back from fully open returns straight to
 * the camera. Used by the pull down (roadmap) and the swipe up (feed). Pure, unit-tested; a
 * worklet, so the gestures call it on the UI thread.
 */
import { MOTION } from '@/constants/tokens';

export type Detent = 'closed' | 'peek' | 'open';

/** Where each stop sits, as a share of the full travel. */
export function detentProgress(detent: Detent, peek: number): number {
  'worklet';
  return detent === 'closed' ? 0 : detent === 'peek' ? peek : 1;
}

/**
 * Where the sheet settles when the finger lifts. `progress` is 0 (camera) to 1 (fully open);
 * `velocity` in pt/ms, positive = towards open. `twoStage` false: no peek, straight to open.
 */
export function releaseDetent({
  start,
  progress,
  velocity,
  peek,
  twoStage,
}: {
  start: Detent;
  progress: number;
  velocity: number;
  peek: number;
  twoStage: boolean;
}): Detent {
  'worklet';
  const { openAt, flick } = MOTION.cameraFeed;
  const onward: Detent = twoStage ? 'peek' : 'open';
  if (start === 'closed') {
    return velocity >= flick || progress >= openAt / 2 ? onward : 'closed';
  }
  if (start === 'peek') {
    if (velocity >= flick || progress >= peek + openAt) return 'open';
    if (velocity <= -flick || progress <= peek - openAt) return 'closed';
    return 'peek';
  }
  return velocity <= -flick || progress <= 1 - openAt ? 'closed' : 'open';
}
