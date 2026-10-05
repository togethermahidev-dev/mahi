/**
 * When the page swipe may take a touch. Pure so it can be unit-tested; the navigator calls these
 * from its gesture handler on every move until one says 'activate', and gives up on the first
 * 'fail'. Pages move sideways only (founder, 2026-10-05: no up/down swiping).
 *
 * - A swipe that starts in a strip the phone owns (status bar, home bar, and for sideways swipes
 *   the side edges where Android's back gesture lives) is left to the phone.
 * - The finger must move SLOP px, mostly along the swipe's own axis; the other axis fails it.
 * - `blocked`: a pop-up screen is open, so the page underneath must not move.
 * - `exclude`: a sideways swipe never starts inside this rectangle (the nav rail owns its touches).
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
  /** Screen rectangle a sideways swipe may not start in, or null. */
  exclude?: Rect | null;
};

export type Rect = { x: number; y: number; width: number; height: number };

function inRect(x: number, y: number, r: Rect | null | undefined): boolean {
  'worklet';
  return !!r && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

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
  if (inRect(t.startX, t.startY, t.exclude)) return 'fail';
  const ax = Math.abs(t.dx);
  const ay = Math.abs(t.dy);
  if (ay > SLOP && ay >= ax) return 'fail';
  if (ax > SLOP && ax > ay) return 'activate';
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
