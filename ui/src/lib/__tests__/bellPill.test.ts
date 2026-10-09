/**
 * The round button beside the bell (owner, 2026-10-09): its icon says where you are — a camera on
 * the camera, the feed on the feed, a padlock when the feed is locked — and the icons scroll in and
 * out of the circle with the swipe.
 */
import { bellHandoff, bellIcons, bellPillOpacity, bellScroll, feedSideIcon } from '@/lib/bellPill';
import { MOTION } from '@/constants/tokens';

const peek = MOTION.cameraFeed.peekShare;
const travel = 36;

describe('feedSideIcon — the icon that scrolls in as the feed comes up', () => {
  it('is the feed icon when the feed opens', () => {
    expect(feedSideIcon(false)).toBe('feed');
  });
  it('is a padlock when the feed is locked', () => {
    expect(feedSideIcon(true)).toBe('lock');
  });
});

describe('bellScroll — how far the icons have scrolled', () => {
  it('is 0 on the camera', () => {
    expect(bellScroll(0, peek)).toBe(0);
  });
  it('follows the finger: half way to the peek is half scrolled', () => {
    expect(bellScroll(peek / 2, peek)).toBeCloseTo(0.5);
  });
  it('is done by the peek, and stays done all the way up', () => {
    expect(bellScroll(peek, peek)).toBe(1);
    expect(bellScroll(1, peek)).toBe(1);
  });
  it('never goes past either end (a spring overshoot)', () => {
    expect(bellScroll(-0.1, peek)).toBe(0);
    expect(bellScroll(1.2, peek)).toBe(1);
  });
  it('without a peek it is the camera until the feed is up', () => {
    expect(bellScroll(0, 0)).toBe(0);
    expect(bellScroll(0.5, 0)).toBe(1);
  });
});

// Compared field by field: a camera icon at 0 may come out as -0, which is the same place.
function expectPlace(
  actual: ReturnType<typeof bellIcons>,
  want: { cameraY: number; cameraOpacity: number; feedY: number; feedOpacity: number }
) {
  expect(actual.cameraY).toBeCloseTo(want.cameraY);
  expect(actual.cameraOpacity).toBeCloseTo(want.cameraOpacity);
  expect(actual.feedY).toBeCloseTo(want.feedY);
  expect(actual.feedOpacity).toBeCloseTo(want.feedOpacity);
}

describe('bellIcons — where each icon sits in the circle', () => {
  it('on the camera: the camera icon centred, the feed icon waiting just below the circle', () => {
    expectPlace(bellIcons(0, travel, false), {
      cameraY: 0,
      cameraOpacity: 1,
      feedY: travel,
      feedOpacity: 1,
    });
  });
  it('on the feed: the camera icon gone up and out, the feed icon centred', () => {
    expectPlace(bellIcons(1, travel, false), {
      cameraY: -travel,
      cameraOpacity: 1,
      feedY: 0,
      feedOpacity: 1,
    });
  });
  it('mid-swipe: both share the circle, one leaving upward as the other rises in', () => {
    expectPlace(bellIcons(0.5, travel, false), {
      cameraY: -travel / 2,
      cameraOpacity: 1,
      feedY: travel / 2,
      feedOpacity: 1,
    });
  });
  it('Reduce Motion: no movement, they swap by fading in place', () => {
    expectPlace(bellIcons(0, travel, true), {
      cameraY: 0,
      cameraOpacity: 1,
      feedY: 0,
      feedOpacity: 0,
    });
    expectPlace(bellIcons(0.25, travel, true), {
      cameraY: 0,
      cameraOpacity: 0.75,
      feedY: 0,
      feedOpacity: 0.25,
    });
    expectPlace(bellIcons(1, travel, true), {
      cameraY: 0,
      cameraOpacity: 0,
      feedY: 0,
      feedOpacity: 1,
    });
  });
});

// One circle at a time: the camera's own circle (the roadmap button) and the page's circle sit at
// the same spot showing the same camera icon, so they swap on the first move of a swipe.
describe('bellHandoff — when the page takes over from the camera’s own circle', () => {
  it('the camera’s circle shows while the camera is still', () => {
    expect(bellHandoff(0)).toBe(0);
  });
  it('the page’s circle takes over on the first move', () => {
    expect(bellHandoff(0.001)).toBe(1);
    expect(bellHandoff(1)).toBe(1);
  });
});

describe('bellPillOpacity — whether the page’s circle shows', () => {
  const fade = MOTION.bellPill.fadeShare;
  it('always shows while the feed (or the locked panel) is up', () => {
    expect(bellPillOpacity({ progress: 1, peek, feedShown: true, handle: true })).toBe(1);
    expect(bellPillOpacity({ progress: peek, peek, feedShown: true, handle: false })).toBe(1);
  });
  it('on the camera, at rest, it is hidden: the camera’s own circle is the one', () => {
    expect(bellPillOpacity({ progress: 0, peek, feedShown: false, handle: true })).toBe(0);
    expect(bellPillOpacity({ progress: 0, peek, feedShown: false, handle: false })).toBe(0);
  });
  it('with the camera’s circle there, it takes over on the first move (no fade, same icon)', () => {
    expect(bellPillOpacity({ progress: 0.001, peek, feedShown: false, handle: true })).toBe(1);
  });
  it('with no circle on the camera (a photo being taken or reviewed, or the post going up), it fades in as the swipe starts', () => {
    const half = (fade * peek) / 2;
    expect(bellPillOpacity({ progress: half, peek, feedShown: false, handle: false })).toBeCloseTo(
      0.5
    );
    expect(bellPillOpacity({ progress: fade * peek, peek, feedShown: false, handle: false })).toBe(
      1
    );
    expect(bellPillOpacity({ progress: 1, peek, feedShown: false, handle: false })).toBe(1);
  });
});
