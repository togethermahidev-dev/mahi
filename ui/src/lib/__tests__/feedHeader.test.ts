/**
 * The full-screen feed's see-through header and its timer (owner, 2026-10-09: "Take the circle and
 * countdown out of the header because it's conflicting with its hide away when scrolling the feed
 * and also fix it because a lil glitchy the header when it goes away and comes back").
 */
import {
  HEADER_START,
  feedChromeOpacity,
  feedTimerSpot,
  headerScroll,
  headerSlide,
} from '@/lib/feedHeader';
import { MOTION, SPACE } from '@/constants/tokens';

const step = MOTION.feedHeader.hideAfter;

/** Feeds a run of scroll positions through, as the list reports them. */
function run(ys: number[], from = HEADER_START) {
  return ys.reduce((s, y) => headerScroll(s, y), from);
}

describe('headerScroll — when the header shows', () => {
  it('starts shown, at the top', () => {
    expect(HEADER_START).toEqual({ shown: true, anchorY: 0 });
  });

  it('paging down hides it once you have gone a little way', () => {
    expect(run([4, 10]).shown).toBe(true);
    expect(run([4, 10, step + 1]).shown).toBe(false);
  });

  it('paging back up shows it again once you have gone a little way up', () => {
    const hidden = run([200, 600, 800]);
    expect(hidden.shown).toBe(false);
    expect(run([790], hidden).shown).toBe(false);
    expect(run([790, 800 - step - 1], hidden).shown).toBe(true);
  });

  it('measures the way up from the furthest point down, not from where it hid', () => {
    const hidden = run([step + 1, 1600]);
    expect(run([1600 - step - 1], hidden).shown).toBe(true);
  });

  it('is always shown at the top, however it got there', () => {
    expect(run([400, 800, 1], { shown: false, anchorY: 800 }).shown).toBe(true);
    expect(run([-30]).shown).toBe(true);
  });

  it('does not flip back and forth on the small jitters of one page move', () => {
    // A long scroll down with a few points of wobble on the way: hidden once, stays hidden.
    const ys = [30, 120, 117, 260, 255, 480, 476, 800];
    const flips = ys
      .map((_, i) => run(ys.slice(0, i + 1)).shown)
      .filter((shown, i, all) => i > 0 && shown !== all[i - 1]).length;
    expect(run(ys).shown).toBe(false);
    expect(flips).toBe(0);
  });

  it('a page that snaps back after a short drag lands where it started', () => {
    // Shown at post 2, a drag down that snaps back: it may hide on the way, but ends shown.
    const shown = { shown: true, anchorY: 800 };
    expect(run([830, 860, 830, 800], shown).shown).toBe(true);
  });
});

describe('headerSlide — how the header moves', () => {
  it('slides up by its own height, the whole way when hidden', () => {
    expect(headerSlide(0, 100, false)).toEqual({ opacity: 1, translateY: 0 });
    expect(headerSlide(0.5, 100, false)).toEqual({ opacity: 1, translateY: -50 });
    expect(headerSlide(1, 100, false)).toEqual({ opacity: 1, translateY: -100 });
  });

  it('with Reduce Motion it fades in place, and leaves only once it has faded out (so it takes no taps)', () => {
    expect(headerSlide(0, 100, true)).toEqual({ opacity: 1, translateY: 0 });
    expect(headerSlide(0.5, 100, true)).toEqual({ opacity: 0.5, translateY: 0 });
    expect(headerSlide(1, 100, true)).toEqual({ opacity: 0, translateY: -100 });
  });

  it('never overshoots', () => {
    expect(headerSlide(-1, 100, false).translateY).toBe(0);
    expect(headerSlide(2, 100, false).translateY).toBe(-100);
    expect(headerSlide(2, 100, true).opacity).toBe(0);
  });
});

describe('feedChromeOpacity — the feed header and timer fade in with the camera to feed morph', () => {
  it('is gone on the camera and through the first part of the morph', () => {
    expect(feedChromeOpacity(0)).toBe(0);
    expect(feedChromeOpacity(MOTION.feedHeader.fadeFrom)).toBe(0);
  });
  it('is fully there with the feed fully open, and never past it', () => {
    expect(feedChromeOpacity(1)).toBe(1);
    expect(feedChromeOpacity(1.2)).toBe(1);
    expect(feedChromeOpacity(0.75)).toBeCloseTo(0.5);
  });
});

describe('feedTimerSpot — the timer, apart from the header', () => {
  const at = feedTimerSpot({ headerH: 100, topInset: SPACE.s8, pushSpace: 0 });

  it('sits just under the header, its right edge in line with the bell', () => {
    expect(at).toEqual({ top: 100 + SPACE.s8, right: SPACE.s24 });
  });

  it('sits under the notifications banner when that shows', () => {
    expect(feedTimerSpot({ headerH: 100, topInset: SPACE.s8, pushSpace: 60 }).top).toBe(
      100 + SPACE.s8 + 60
    );
  });
});
