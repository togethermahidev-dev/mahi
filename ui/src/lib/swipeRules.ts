/**
 * When the page swipe may take a touch. Pure so it can be unit-tested; the navigator calls these
 * from its gesture handler on every move until one says 'activate', and gives up on the first
 * 'fail'. Pages move sideways only (founder, 2026-10-05: no up/down swiping).
 *
 * - A swipe that starts in a strip the phone owns (status bar, home bar, and for sideways swipes
 *   the side edges where Android's back gesture lives; an iPhone passes `edge: 0`) is left to
 *   the phone.
 * - The finger must move SWIPE.slop px, mostly along the swipe's own axis; the other axis fails it.
 * - `blocked`: a pop-up screen is open, so the page underneath must not move.
 * - `exclude`: a sideways swipe never starts inside this rectangle (the nav rail owns its touches).
 *
 * Every function here is a worklet, so a navigator can call it on the UI thread from a gesture
 * callback as well as from ordinary code.
 */
import { SWIPE } from '@/constants/tokens';
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
  /** Side strip left to the phone; SIDE_EDGE (Android's back gesture) unless given. */
  edge?: number;
};

export type Rect = { x: number; y: number; width: number; height: number };

function inRect(x: number, y: number, r: Rect | null | undefined): boolean {
  'worklet';
  return !!r && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/** Side strip left to Android's back gesture. An iPhone has none on Mahi's pages, so passes 0. */
export const SIDE_EDGE = 24;
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
  const edge = t.edge ?? SIDE_EDGE;
  if (t.startX < edge || t.startX > t.width - edge) return 'fail';
  if (inRect(t.startX, t.startY, t.exclude)) return 'fail';
  const ax = Math.abs(t.dx);
  const ay = Math.abs(t.dy);
  if (ay > SWIPE.slop && ay >= ax) return 'fail';
  if (ax > SWIPE.slop && ax > ay) return 'activate';
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

// Sideways: a drag of SWIPE.distance, or a flick of SWIPE.velocity, moves one page.

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
  if ((dx > SWIPE.distance || vx > SWIPE.velocity) && index > 0) next = index - 1;
  if ((dx < -SWIPE.distance || vx < -SWIPE.velocity) && index < count - 1) next = index + 1;
  return next;
}

// ─── Closing a profile opened over a page ─────────────────────────────────────
// It follows the finger to the right and closes like a page swipe (founder, 2026-10-05: "the
// swipe needs to be clean like every other swipe on the app").

/** Where the profile sits while dragged: right of where it started, never left of the screen. */
export function backSwipeX(startX: number, dx: number): number {
  'worklet';
  return Math.max(0, startX + dx);
}

/**
 * Whether letting go closes it: the drag or flick that turns a page (`horizontalRelease`), to the
 * right. A flick back to the left keeps it open.
 */
export function backSwipeCloses(dx: number, vx: number): boolean {
  'worklet';
  if (vx < -SWIPE.velocity) return false;
  return dx > SWIPE.distance || vx > SWIPE.velocity;
}
