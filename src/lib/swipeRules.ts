/**
 * When a page swipe may take a touch. Pure so it can be unit-tested; the navigators call these
 * from their gesture handlers on every move until one says 'activate' or 'fail'.
 *
 * - A swipe that starts in a strip the phone owns (status bar, home bar, and for sideways swipes
 *   the side edges where Android's back gesture lives) is left to the phone.
 * - The finger must move SLOP px, mostly along the swipe's own axis; the other axis fails it.
 * - `blocked`: a pop-up screen is open, so the page underneath must not move.
 */
export type SwipeDecision = 'activate' | 'fail' | 'wait';

type Touch = {
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  insets: { top: number; bottom: number };
  blocked: boolean;
};

const SLOP = 20;
/** Side strip left to the system back gesture. */
const EDGE = 24;
/** Minimum strip kept for the home bar / gesture nav, even on phones reporting no inset. */
const MIN_BOTTOM_ZONE = 24;

function inSystemStrip(t: Touch): boolean {
  return t.startY < t.insets.top || t.startY > t.height - Math.max(t.insets.bottom, MIN_BOTTOM_ZONE);
}

export function horizontalSwipe(t: Touch): SwipeDecision {
  if (t.blocked || inSystemStrip(t)) return 'fail';
  if (t.startX < EDGE || t.startX > t.width - EDGE) return 'fail';
  const ax = Math.abs(t.dx);
  const ay = Math.abs(t.dy);
  if (ay > SLOP && ay >= ax) return 'fail';
  if (ax > SLOP && ax > ay) return 'activate';
  return 'wait';
}

export function verticalSwipe(t: Touch & { onFeed: boolean; feedAtTop: boolean }): SwipeDecision {
  if (t.blocked || inSystemStrip(t)) return 'fail';
  const ax = Math.abs(t.dx);
  const ay = Math.abs(t.dy);
  if (ax > SLOP && ax >= ay) return 'fail';
  if (ay > SLOP && ay > ax) {
    // On Feed the list scrolls; only a pull down from its top goes back to Camera.
    if (t.onFeed) return t.dy > 0 && t.feedAtTop ? 'activate' : 'fail';
    return 'activate';
  }
  return 'wait';
}
