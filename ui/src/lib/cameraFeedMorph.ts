/**
 * Camera to feed morph (owner, 2026-10-09): as the finger swipes the open feed up, the camera
 * minimises into a small rounded card going up and out (fading near the end) while the feed comes
 * in as a card that maximises to exactly full screen — both squashed mid-swipe, like the pull-down
 * drawer's card and the tab morph (morph.ts). One progress value drives both, so swiping back runs
 * it in reverse. Pure and unit-tested; a worklet, read by the animated styles in
 * src/screens/CameraFeedPage.tsx. The locked feed's small lift doesn't use it.
 */
import { MOTION } from '@/constants/tokens';

export type CardFrame = {
  /** Scale about the card's centre. */
  scale: number;
  /** Down (pt) from where it sits full screen. */
  translateY: number;
  borderRadius: number;
  opacity: number;
};

/**
 * Both cards at `progress` (0 = camera full screen, 1 = feed full screen) on a page this tall.
 * The camera's lower edge follows the finger (it sits at `(1 - progress)` of the page), so the
 * peek shows the same share of the feed as a plain slide. Reduce Motion: no scaling or rounding —
 * the camera slides up and the feed fades in under it.
 */
export function cameraFeedMorph(
  progress: number,
  pageHeight: number,
  reduceMotion: boolean
): { camera: CardFrame; feed: CardFrame } {
  'worklet';
  const { cameraToScale, cameraFadeFrom, feedFromScale, feedFromY, peekShare } = MOTION.cameraFeed;
  const radius = MOTION.pageMorph.fromRadius;
  const p = Math.max(0, Math.min(1, progress));
  // What's left of the way: written as `rest` so the feed lands on exactly 1 and 0 at the end.
  const rest = 1 - p;
  const cameraScale = reduceMotion ? 1 : 1 - (1 - cameraToScale) * p;
  const cameraOpacity =
    p <= cameraFadeFrom ? 1 : Math.max(0, (1 - p) / (1 - cameraFadeFrom));
  const feedOpacity = peekShare > 0 ? Math.min(1, p / peekShare) : 1;
  return {
    camera: {
      scale: cameraScale,
      // Shrinking about its centre lifts its lower edge by half the lost height: add the rest.
      translateY: (pageHeight * (1 - cameraScale)) / 2 - p * pageHeight,
      borderRadius: reduceMotion ? 0 : radius * p,
      opacity: cameraOpacity,
    },
    feed: {
      scale: reduceMotion ? 1 : 1 - (1 - feedFromScale) * rest,
      translateY: reduceMotion ? 0 : feedFromY * pageHeight * rest,
      borderRadius: reduceMotion ? 0 : radius * rest,
      opacity: feedOpacity,
    },
  };
}
