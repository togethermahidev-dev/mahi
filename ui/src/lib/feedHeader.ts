/**
 * The full-screen feed's see-through header (MAHI, the bell) and its timer (owner, 2026-10-09:
 * "Take the circle and countdown out of the header because it's conflicting with its hide away
 * when scrolling the feed and also fix it because a lil glitchy the header when it goes away and
 * comes back").
 * - The header slides away as you page down and comes back as you page up, or at the top. It flips
 *   only when the direction really changes (hideAfter of travel), so a page move animates it once.
 * - The timer (ring and clock) is its own floating piece on the right, under the header's area: it
 *   stays put while you page and the header comes and goes above it.
 * Pure and unit-tested; the style helpers are worklets. Screens: src/screens/FeedScreen.tsx and
 * src/screens/CameraFeedPage.tsx.
 */
import { MOTION, SPACE } from '@/constants/tokens';
import { atListTop } from './swipeRules';

export type HeaderScroll = {
  shown: boolean;
  /** Where the current run started: the furthest point up while shown, down while hidden. */
  anchorY: number;
};

export const HEADER_START: HeaderScroll = { shown: true, anchorY: 0 };

/** The header's state after the list reports scroll position `y`. */
export function headerScroll(
  state: HeaderScroll,
  y: number,
  hideAfter: number = MOTION.feedHeader.hideAfter
): HeaderScroll {
  if (atListTop(y)) return { shown: true, anchorY: y };
  if (state.shown) {
    const anchorY = Math.min(state.anchorY, y);
    return y - anchorY > hideAfter ? { shown: false, anchorY: y } : { shown: true, anchorY };
  }
  const anchorY = Math.max(state.anchorY, y);
  return anchorY - y > hideAfter ? { shown: true, anchorY: y } : { shown: false, anchorY };
}

/**
 * Where the header (or anything leaving with it) sits, `hide` from 0 (shown) to 1 (hidden): it
 * slides up by `distance`. Reduce Motion: it fades in place, and moves off only once faded out, so
 * a see-through header never takes a tap.
 */
export function headerSlide(
  hide: number,
  distance: number,
  reduceMotion: boolean
): { opacity: number; translateY: number } {
  'worklet';
  const h = Math.min(1, Math.max(0, hide));
  if (reduceMotion) return { opacity: 1 - h, translateY: h >= 1 ? -distance : 0 };
  return { opacity: 1, translateY: h === 0 ? 0 : -distance * h };
}

/** The feed's header and timer fade in over the end of the camera to feed morph (0 to 1). */
export function feedChromeOpacity(progress: number): number {
  'worklet';
  const from = MOTION.feedHeader.fadeFrom;
  return Math.min(1, Math.max(0, (progress - from) / (1 - from)));
}

/** The timer's fixed spot: just under the header (and the notifications banner), right edge in
 *  line with the bell's (AppHeader's side padding). */
export function feedTimerSpot({
  headerH,
  topInset,
  pushSpace,
}: {
  headerH: number;
  /** The gap under the header (the camera page's). */
  topInset: number;
  /** Room the notifications banner takes, 0 when it isn't showing. */
  pushSpace: number;
}): { top: number; right: number } {
  return { top: headerH + topInset + pushSpace, right: SPACE.s24 };
}
