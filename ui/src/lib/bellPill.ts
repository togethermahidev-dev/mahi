/**
 * The round button beside the bell (owner, 2026-10-09): its icon says where you are — a camera on
 * the camera, the feed on the feed, a padlock when the feed is locked — and the icons scroll in and
 * out of the circle as the camera slides up or back, following the finger. Pure and unit-tested;
 * the circle is in src/screens/CameraFeedPage.tsx, the camera's own one (the roadmap button) is
 * PullHandle in src/components/CameraPull.tsx. Every function here runs in animated styles too.
 */
import { MOTION } from '@/constants/tokens';

/** The icon that scrolls in as the feed comes up: the feed, or a padlock when it's locked. */
export function feedSideIcon(locked: boolean): 'feed' | 'lock' {
  return locked ? 'lock' : 'feed';
}

/** How far the icons have scrolled: 0 = the camera icon, 1 = the feed's; done by the peek. */
export function bellScroll(progress: number, peek: number): number {
  'worklet';
  if (peek <= 0) return progress > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, progress / peek));
}

/**
 * Where each icon sits in the circle (pt down from centred) and how see-through: the camera icon
 * slides up and out as the feed's rises in from just below (the circle clips both). Reduce Motion:
 * no movement, they swap by fading in place.
 */
export function bellIcons(
  scroll: number,
  travel: number,
  reduceMotion: boolean
): { cameraY: number; cameraOpacity: number; feedY: number; feedOpacity: number } {
  'worklet';
  if (reduceMotion) {
    return { cameraY: 0, cameraOpacity: 1 - scroll, feedY: 0, feedOpacity: scroll };
  }
  return {
    cameraY: -scroll * travel,
    cameraOpacity: 1,
    feedY: (1 - scroll) * travel,
    feedOpacity: 1,
  };
}

/**
 * One circle at a time: the camera's own circle and the page's sit at the same spot with the same
 * camera icon, so the page's takes over on the first move of a swipe (1) and hands back once the
 * camera is still again (0).
 */
export function bellHandoff(progress: number): number {
  'worklet';
  return progress > 0 ? 1 : 0;
}

/**
 * Whether the page's circle shows: always while the feed (or the locked panel) is up; on the
 * camera only once it starts to lift. With the camera's own circle there (`handle`) it swaps in at
 * once; without one (a photo being taken or reviewed, or the post going up: no roadmap button)
 * it fades in over the start of the scroll.
 */
export function bellPillOpacity(s: {
  progress: number;
  peek: number;
  feedShown: boolean;
  handle: boolean;
}): number {
  'worklet';
  if (s.feedShown) return 1;
  if (s.handle) return bellHandoff(s.progress);
  return Math.min(1, bellScroll(s.progress, s.peek) / MOTION.bellPill.fadeShare);
}
