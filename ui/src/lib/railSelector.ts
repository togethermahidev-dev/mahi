/**
 * Where the nav rail's selector sits. Pure so it can be unit-tested; NavRail calls these from its
 * gesture callbacks on the UI thread as well as from ordinary code, so each one is a worklet.
 *
 * All positions are px from the top of the rail. A span is the selector's top and bottom edge.
 */
export type RailGeometry = {
  /** Space above the first button inside the rail. */
  padding: number;
  /** Button height (and width). */
  button: number;
  /** Space between two buttons (half above, half below each). */
  gap: number;
  /** How many buttons. */
  count: number;
};

export type Span = { top: number; bottom: number };

export type RailTab = 'camera' | 'feed' | 'messages' | 'profile';

/**
 * Whether the rail is on screen. It is seen on the Camera only (owner, 2026-10-02); Feed, Profile
 * and Messages get the dock instead (`dockShows`). Neither shows under a pop-up or a full-screen view.
 */
export function railShows(s: {
  /** Whether the glass rail is used at all (false with the phone's own tab bar). */
  on: boolean;
  /** The screen showing. */
  tab: RailTab;
  overlay: boolean;
  covered: boolean;
}): boolean {
  return s.on && s.tab === 'camera' && !s.overlay && !s.covered;
}

/**
 * Whether the glass bar shows along the bottom of the page (the dock): on Feed, Profile and
 * Messages, so every page has a tap to every other (owner, 2026-10-06, re-deciding #51). Same
 * `on` and the same hiding rules as the rail.
 */
export function dockShows(s: Parameters<typeof railShows>[0]): boolean {
  return s.on && s.tab !== 'camera' && !s.overlay && !s.covered;
}

function centreOf(g: RailGeometry, i: number): number {
  'worklet';
  return g.padding + g.gap / 2 + g.button / 2 + i * (g.button + g.gap);
}

/** The span of button `i`. */
export function slotSpan(g: RailGeometry, i: number): Span {
  'worklet';
  const top = g.padding + g.gap / 2 + i * (g.button + g.gap);
  return { top, bottom: top + g.button };
}

/** The button nearest a finger at `y`; off either end it is the first or last button. */
export function nearestSlot(g: RailGeometry, y: number): number {
  'worklet';
  const i = Math.round((y - centreOf(g, 0)) / (g.button + g.gap));
  return Math.min(g.count - 1, Math.max(0, i));
}

/** The selector centred on a dragging finger, kept between the first and last button. */
export function followSpan(g: RailGeometry, y: number): Span {
  'worklet';
  const c = Math.min(centreOf(g, g.count - 1), Math.max(centreOf(g, 0), y));
  return { top: c - g.button / 2, bottom: c + g.button / 2 };
}

/**
 * The selector's move from where it is to a button: first it stretches to cover both, then it
 * contracts onto the new button. With Reduce Motion on it just moves there.
 */
export function morphPlan(
  current: Span,
  target: Span,
  reduceMotion: boolean
): { stretch: Span; settle: Span } {
  'worklet';
  if (reduceMotion) return { stretch: target, settle: target };
  return {
    stretch: {
      top: Math.min(current.top, target.top),
      bottom: Math.max(current.bottom, target.bottom),
    },
    settle: target,
  };
}
