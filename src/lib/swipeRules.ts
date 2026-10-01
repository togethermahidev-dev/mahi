/**
 * When a page swipe may take a touch. Pure so it can be unit-tested; the navigators call these
 * from their gesture handlers on every move until one says 'activate' or 'fail'.
 *
 * - A swipe that starts in a strip the phone owns (status bar, home bar, and for sideways swipes
 *   the side edges where Android's back gesture lives) is left to the phone.
 * - The finger must move SLOP px, mostly along the swipe's own axis; the other axis fails it.
 * - `blocked`: a pop-up screen is open, so the page underneath must not move.
 *
 * Every function here is a worklet, so a navigator can call it on the UI thread from a gesture
 * callback as well as from ordinary code.
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
  'worklet';
  return (
    t.startY < t.insets.top || t.startY > t.height - Math.max(t.insets.bottom, MIN_BOTTOM_ZONE)
  );
}

export function horizontalSwipe(t: Touch): SwipeDecision {
  'worklet';
  if (t.blocked || inSystemStrip(t)) return 'fail';
  if (t.startX < EDGE || t.startX > t.width - EDGE) return 'fail';
  const ax = Math.abs(t.dx);
  const ay = Math.abs(t.dy);
  if (ay > SLOP && ay >= ax) return 'fail';
  if (ax > SLOP && ax > ay) return 'activate';
  return 'wait';
}

/**
 * `feedAtTop`: the Feed list is at its top (see atListTop).
 * `listMoved`: the Feed list has scrolled since the finger went down. The list then keeps the drag,
 * as React Native's scroll view did: it won't hand over a drag it has already scrolled.
 */
export function verticalSwipe(
  t: Touch & { onFeed: boolean; feedAtTop: boolean; listMoved: boolean }
): SwipeDecision {
  'worklet';
  if (t.blocked || inSystemStrip(t)) return 'fail';
  if (t.onFeed && t.listMoved) return 'fail';
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

/** The Feed list counts as at its top within its first 2px, or while pulled down past it. */
export function atListTop(offsetY: number): boolean {
  'worklet';
  return offsetY <= 2;
}

// ─── Once a swipe has started ─────────────────────────────────────────────────
// Distances are px from where the finger went down; velocities are px per ms (a gesture
// handler reports px per second: divide by 1000).

/** Sideways: a drag this far, or a flick this fast, moves one page. */
const H_SWIPE_PX = 60;
const H_SWIPE_V = 0.4;
/** Up/down: a drag this far, or a flick this fast, moves one page. */
const V_SWIPE_PX = 60;
const V_SWIPE_V = 0.4;
/** A pull down on Camera this far, or this fast, opens search. */
const SEARCH_PULL_PX = 80;
const SEARCH_PULL_V = 0.3;

/** Where the page strip sits while dragged: past the first or last page it moves a third as far. */
export function rubberBand(raw: number, min: number, max: number): number {
  'worklet';
  if (raw > max) return max + (raw - max) / 3;
  if (raw < min) return min + (raw - min) / 3;
  return raw;
}

/**
 * The page a sideways swipe lands on (0 = left). A drag right goes one page left, a drag left one
 * page right; when the drag and the flick disagree, the page to the right wins.
 */
export function horizontalRelease(index: number, count: number, dx: number, vx: number): number {
  'worklet';
  let next = index;
  if ((dx > H_SWIPE_PX || vx > H_SWIPE_V) && index > 0) next = index - 1;
  if ((dx < -H_SWIPE_PX || vx < -H_SWIPE_V) && index < count - 1) next = index + 1;
  return next;
}

/**
 * The page an up/down swipe lands on (0 = top, Camera). A drag up goes one page down, a drag down
 * one page up; when they disagree, the upper page wins. On Camera a pull down opens search
 * instead, and the page stays on Camera.
 */
export function verticalRelease(
  index: number,
  count: number,
  dy: number,
  vy: number
): { index: number; openSearch: boolean } {
  'worklet';
  if (index === 0 && (dy > SEARCH_PULL_PX || vy > SEARCH_PULL_V)) {
    return { index: 0, openSearch: true };
  }
  let next = index;
  if ((dy < -V_SWIPE_PX || vy < -V_SWIPE_V) && index < count - 1) next = index + 1;
  if ((dy > V_SWIPE_PX || vy > V_SWIPE_V) && index > 0) next = index - 1;
  return { index: next, openSearch: false };
}
