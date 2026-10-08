/**
 * One screen for the camera and the feed (owner, 2026-10-08): the camera is the front sheet.
 * Swipe it up and it slides up, leaving a strip at the top, with the feed behind it — the mirror
 * of the pull down, which slides it down to show the roadmap behind. Tap the strip, the Camera
 * pill or swipe it down and the camera is back. Pure geometry and release rules, unit-tested.
 */
import { cameraStrip, feedSwipe, feedTop, lockedGap } from '@/lib/cameraFeed';
import { SWIPE } from '@/constants/tokens';

const page = { width: 400, height: 800 };

describe('cameraStrip — the camera slid up while the feed is showing', () => {
  it('leaves a strip a fifth of the page tall under the header; the rest slides up', () => {
    // 100 header + 160 strip = the camera's bottom edge at 260, so it slides up 540.
    expect(cameraStrip(page, 100)).toEqual({ bottom: 260, lift: 540 });
  });
});

describe('feedTop — where the feed’s rows start', () => {
  it('is just under the camera strip', () => {
    expect(feedTop(cameraStrip(page, 100))).toBe(260 + 8);
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

// From the peek (two-stage, owner 2026-10-08) the camera can go either way: on, or back.
describe('feedSwipe — from the peek, either way', () => {
  const s = SWIPE.slop + 1;
  it('takes an upward or a downward drag, never a sideways one', () => {
    const peek = { startY: 300, insetTop: 50, open: false, either: true };
    expect(feedSwipe({ ...peek, dx: 0, dy: -s })).toBe('activate');
    expect(feedSwipe({ ...peek, dx: 0, dy: s })).toBe('activate');
    expect(feedSwipe({ ...peek, dx: s, dy: 0 })).toBe('fail');
  });
});
