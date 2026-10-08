/**
 * One screen for the camera and the feed (owner, 2026-10-08): swipe the camera up and it shrinks
 * into a small card at the top while the feed takes the screen; tap the card, the Camera pill or
 * swipe it down and the camera is back. Pure geometry and release rules, unit-tested.
 */
import { cameraCard, feedOpensOnRelease, feedSwipe, feedTop, lockedGap } from '@/lib/cameraFeed';
import { SWIPE } from '@/constants/tokens';

const page = { width: 400, height: 800 };

describe('cameraCard — the small camera when the feed is showing', () => {
  it('keeps the camera’s shape at a third of its width, under the header on the left', () => {
    const card = cameraCard(page, 100);
    expect(card.scale).toBe(0.32);
    expect(card).toEqual({ x: 16, y: 108, width: 128, height: 256, scale: 0.32 });
  });
});

describe('feedTop — where the feed’s rows start', () => {
  it('is just under the camera card', () => {
    expect(feedTop(cameraCard(page, 100))).toBe(108 + 256 + 8);
  });
});

describe('feedOpensOnRelease — an upward swipe past a quarter of the way, or a flick', () => {
  const travel = 500;
  it('opens past a quarter of the travel', () => {
    expect(feedOpensOnRelease({ progress: 0.3, velocity: 0, travel, startedOpen: false })).toBe(true);
    expect(feedOpensOnRelease({ progress: 0.1, velocity: 0, travel, startedOpen: false })).toBe(false);
  });
  it('a flick up opens from anywhere; a flick down closes', () => {
    expect(feedOpensOnRelease({ progress: 0.05, velocity: -2, travel, startedOpen: false })).toBe(true);
    expect(feedOpensOnRelease({ progress: 0.9, velocity: 2, travel, startedOpen: true })).toBe(false);
  });
  it('from open, closes only past a quarter of the way back', () => {
    expect(feedOpensOnRelease({ progress: 0.8, velocity: 0, travel, startedOpen: true })).toBe(true);
    expect(feedOpensOnRelease({ progress: 0.7, velocity: 0, travel, startedOpen: true })).toBe(false);
  });
});

// The swipe that opens or closes the feed decides by direction, like the camera's pull: it never
// takes a sideways drag (that's the page swipe to Messages / Profile) or the opposite direction.
describe('feedSwipe — when a drag on the camera moves the feed', () => {
  const s = SWIPE.slop + 1;
  const base = { startY: 300, insetTop: 50 };
  it('camera full screen: an upward drag takes it, even drifting a little sideways', () => {
    expect(feedSwipe({ ...base, open: false, dx: 0, dy: -s })).toBe('activate');
    expect(feedSwipe({ ...base, open: false, dx: s - 2, dy: -s * 2 })).toBe('activate');
  });
  it('a sideways drag is left to the page swipe', () => {
    expect(feedSwipe({ ...base, open: false, dx: s, dy: 0 })).toBe('fail');
    expect(feedSwipe({ ...base, open: false, dx: -s * 2, dy: -s })).toBe('fail');
  });
  it('a downward drag on the full camera is left to the camera’s own pull', () => {
    expect(feedSwipe({ ...base, open: false, dx: 0, dy: s })).toBe('fail');
  });
  it('feed showing: a downward drag on the card takes it; up is left alone', () => {
    expect(feedSwipe({ ...base, open: true, dx: 0, dy: s })).toBe('activate');
    expect(feedSwipe({ ...base, open: true, dx: 0, dy: -s })).toBe('fail');
  });
  it('waits while the finger has barely moved, and never takes a drag from the status bar', () => {
    expect(feedSwipe({ ...base, open: false, dx: 1, dy: -1 })).toBe('wait');
    expect(feedSwipe({ startY: 20, insetTop: 50, open: false, dx: 0, dy: -s })).toBe('fail');
  });
});

// Owner, 2026-10-08: a locked feed doesn't open; the camera lifts a quarter of the screen and the
// gap underneath says why and what to do.
describe('lockedGap — how far the camera lifts when the feed is locked', () => {
  it('a quarter of the page', () => {
    expect(lockedGap(800)).toBe(200);
    expect(lockedGap(874)).toBe(219);
  });
});
