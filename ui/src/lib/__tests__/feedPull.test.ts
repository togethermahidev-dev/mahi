/**
 * Back to the camera from the full-screen feed (owner, 2026-10-09: "how to make the pull down on
 * the feed and the swipe back up to the camera"): at the first post, a downward drag runs the
 * camera to feed morph backwards, following the finger; below it, the list pages as normal. At the
 * top a "Switch to camera" pill floats over the feed ("when the feed reaches the top have a
 * floating arrow circular pill that say switch to camera").
 */
import { dragProgress, feedPullDown, switchPillOpacity, switchPillShown } from '@/lib/feedPull';
import { MOTION, SWIPE } from '@/constants/tokens';

const s = SWIPE.slop + 1;
const base = { atTop: true, startY: 300, insetTop: 50 };

describe('feedPullDown — when a drag on the open feed brings the camera back', () => {
  it('at the first post, a downward drag takes it, even drifting a little sideways', () => {
    expect(feedPullDown({ ...base, dx: 0, dy: s })).toBe('activate');
    expect(feedPullDown({ ...base, dx: s - 2, dy: s * 2 })).toBe('activate');
  });
  it('below the first post it never takes the drag: the list pages', () => {
    expect(feedPullDown({ ...base, atTop: false, dx: 0, dy: s })).toBe('fail');
  });
  it('an upward drag is the list paging to the next post', () => {
    expect(feedPullDown({ ...base, dx: 0, dy: -s })).toBe('fail');
  });
  it('a sideways drag is left to the page swipe', () => {
    expect(feedPullDown({ ...base, dx: s, dy: 0 })).toBe('fail');
    expect(feedPullDown({ ...base, dx: -s * 2, dy: s })).toBe('fail');
  });
  it('waits while the finger has barely moved, and never takes a drag from the status bar', () => {
    expect(feedPullDown({ ...base, dx: 1, dy: 1 })).toBe('wait');
    expect(feedPullDown({ ...base, startY: 20, dx: 0, dy: s })).toBe('fail');
  });
});

describe('dragProgress — the morph following the finger', () => {
  it('a drag down from the open feed runs it backwards, a third of the screen all the way', () => {
    expect(dragProgress(1, 0, 300)).toBe(1);
    expect(dragProgress(1, 150, 300)).toBeCloseTo(0.5);
    expect(dragProgress(1, 300, 300)).toBe(0);
  });
  it('a drag up from the camera runs it forwards', () => {
    expect(dragProgress(0, -150, 300)).toBeCloseTo(0.5);
  });
  it('never goes past either end', () => {
    expect(dragProgress(1, -100, 300)).toBe(1);
    expect(dragProgress(0, 100, 300)).toBe(0);
    expect(dragProgress(1, 50, 0)).toBe(1);
  });
});

describe('switchPillShown — the "Switch to camera" pill', () => {
  const open = { open: true, atTop: true, locked: false, rows: false };
  it('shows on the open full-screen feed at its first post', () => {
    expect(switchPillShown(open)).toBe(true);
  });
  it('goes once you page past the first post', () => {
    expect(switchPillShown({ ...open, atTop: false })).toBe(false);
  });
  it('never on the camera, a locked feed, or the rows layout', () => {
    expect(switchPillShown({ ...open, open: false })).toBe(false);
    expect(switchPillShown({ ...open, locked: true })).toBe(false);
    expect(switchPillShown({ ...open, rows: true })).toBe(false);
  });
});

describe('switchPillOpacity — out of the way mid-swipe', () => {
  const fade = MOTION.cameraFeed.pillFadeShare;
  it('fully shown with the feed all the way open', () => {
    expect(switchPillOpacity(1, true)).toBe(1);
  });
  it('fades out over the first part of the pull down, gone mid-swipe', () => {
    expect(switchPillOpacity(1 - fade / 2, true)).toBeCloseTo(0.5);
    expect(switchPillOpacity(0.5, true)).toBe(0);
  });
  it('hidden whenever it should not show', () => {
    expect(switchPillOpacity(1, false)).toBe(0);
  });
});
