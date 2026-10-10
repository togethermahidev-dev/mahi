import { horizontalSwipe } from '../swipeRules';
import { MOTION, SWIPE } from '@/constants/tokens';
import {
  cameraDrag,
  drawerOffset,
  drawerShouldOpen,
  pullOffset,
  pullParallax,
  verticalPull,
} from '../cameraPull';

const touch = (dx: number, dy: number, startY = 300) => ({ startY, dx, dy, insetTop: 47 });

describe('camera pull-down (the waiting camera gives a little)', () => {
  describe('verticalPull: when a drag counts as a pull', () => {
    it('waits until the finger has moved far enough', () => {
      expect(verticalPull(touch(2, 10))).toBe('wait');
    });
    it('takes a clear downward drag', () => {
      expect(verticalPull(touch(4, SWIPE.slop + 5))).toBe('activate');
    });
    it('leaves a mostly sideways drag to the page swipe', () => {
      expect(verticalPull(touch(SWIPE.slop + 5, 6))).toBe('fail');
      expect(verticalPull(touch(-(SWIPE.slop + 5), 6))).toBe('fail');
    });
    it('fails a diagonal that is as much sideways as down', () => {
      expect(verticalPull(touch(SWIPE.slop + 5, SWIPE.slop + 5))).toBe('fail');
    });
    it('never starts on a drag upwards', () => {
      expect(verticalPull(touch(0, -(SWIPE.slop + 5)))).toBe('fail');
    });
    it('leaves a drag from the status bar to the phone', () => {
      expect(verticalPull(touch(0, SWIPE.slop + 5, 20))).toBe('fail');
    });
  });

  describe('pullOffset: the rubber band', () => {
    it('gives nothing for no drag or a drag up', () => {
      expect(pullOffset(0)).toBe(0);
      expect(pullOffset(-40)).toBe(0);
    });
    it('gives less than the finger moved, and never past the limit', () => {
      expect(pullOffset(24)).toBeGreaterThan(0);
      expect(pullOffset(24)).toBeLessThan(24);
      expect(pullOffset(10000)).toBeLessThan(MOTION.pull.limit);
      expect(pullOffset(10000)).toBeGreaterThan(MOTION.pull.limit * 0.95);
    });
    it('keeps giving as the finger goes further', () => {
      expect(pullOffset(80)).toBeGreaterThan(pullOffset(40));
    });
  });

  describe('pullParallax: the layer behind the camera', () => {
    it('sits still and a touch small at rest', () => {
      expect(pullParallax(0)).toEqual({ translateY: 0, scale: MOTION.pull.fromScale });
    });
    it('moves a share of the pull and reaches full size at the limit', () => {
      const at = pullParallax(MOTION.pull.limit);
      expect(at.translateY).toBeCloseTo(MOTION.pull.limit * MOTION.pull.parallax);
      expect(at.scale).toBeCloseTo(1);
    });
    it('is half way at half the pull', () => {
      expect(pullParallax(MOTION.pull.limit / 2).scale).toBeCloseTo(
        (MOTION.pull.fromScale + 1) / 2
      );
    });
    it('never grows past full size', () => {
      expect(pullParallax(MOTION.pull.limit * 3).scale).toBe(1);
    });
  });

  describe('full camera drawer', () => {
    const open = 600;

    it('follows a downward finger with resistance and never passes the open position', () => {
      expect(drawerOffset(-20, open)).toBe(0);
      expect(drawerOffset(120, open)).toBeGreaterThan(0);
      expect(drawerOffset(120, open)).toBeLessThan(120);
      expect(drawerOffset(10000, open)).toBeLessThanOrEqual(open);
    });

    it('opens only after the commitment threshold', () => {
      expect(drawerShouldOpen(open * MOTION.pull.openAt - 1, open)).toBe(false);
      expect(drawerShouldOpen(open * MOTION.pull.openAt, open)).toBe(true);
    });
  });
});

// Owner, 2026-10-08: the swipe up wasn't reliable. One gesture on the camera now takes both
// directions — down is the roadmap drawer, up is the feed — and it reacts to half the old slop.
describe('cameraDrag — which way a drag on the camera goes', () => {
  const h = SWIPE.slop / 2 + 1;
  const base = { startY: 300, insetTop: 50, moved: false, feedOn: true };
  it('a short upward drag is the feed', () => {
    expect(cameraDrag({ ...base, dx: 0, dy: -h })).toBe('feed');
    expect(cameraDrag({ ...base, dx: 3, dy: -h })).toBe('feed');
  });
  // Owner, 2026-10-09: "from camera I can't swipe across to messages". A right thumb's swipe
  // toward Messages arcs up-right; the camera took it at half the slop before the page swipe
  // could. A diagonal start now waits for the full slop, so the page swipe gets its turn.
  it('a diagonal start waits for the full slop instead of taking the feed', () => {
    expect(cameraDrag({ ...base, dx: h - 2, dy: -h })).toBe('wait');
    expect(cameraDrag({ ...base, dx: 9, dy: -11 })).toBe('wait');
  });
  // Owner, 2026-10-10: a sideways swipe that starts with a small upward wobble was still taken
  // by the camera. Only a clearly vertical start (steeper than about 72°) is the camera's early.
  it('a wobbly start waits; only a clearly vertical start takes the camera at half the slop', () => {
    expect(cameraDrag({ ...base, dx: 5, dy: -h })).toBe('wait');
    expect(cameraDrag({ ...base, dx: 3, dy: -h })).toBe('feed');
  });
  it('a diagonal that stays vertical past the full slop is still the feed', () => {
    expect(cameraDrag({ ...base, dx: 12, dy: -(SWIPE.slop + 1) })).toBe('feed');
  });
  it('a short downward drag is the drawer', () => {
    expect(cameraDrag({ ...base, dx: 0, dy: h })).toBe('drawer');
  });
  it('with the drawer moved, either way belongs to the drawer', () => {
    expect(cameraDrag({ ...base, moved: true, dx: 0, dy: -h })).toBe('drawer');
  });
  it('no feed on this screen: an upward drag is left alone', () => {
    expect(cameraDrag({ ...base, feedOn: false, dx: 0, dy: -h })).toBe('fail');
  });
  it('sideways is the page swipe; a barely-moved finger waits; the status bar is the phone’s', () => {
    expect(cameraDrag({ ...base, dx: h, dy: 2 })).toBe('fail');
    expect(cameraDrag({ ...base, dx: 2, dy: -3 })).toBe('wait');
    expect(cameraDrag({ ...base, startY: 20, dx: 0, dy: -h })).toBe('fail');
  });
});

// The race on the phone: both gestures see every move; whichever claims first wins.
describe('cameraDrag vs the page swipe — a thumb arc toward Messages', () => {
  const screen = { width: 390, height: 760, insets: { top: 50, bottom: 34 }, blocked: false };
  const claimFirst = (arc: [number, number][], startX: number) => {
    for (const [dx, dy] of arc) {
      const cam = cameraDrag({ startY: 500, insetTop: 50, moved: false, feedOn: true, dx, dy });
      const page = horizontalSwipe({ ...screen, startX, startY: 500, dx, dy });
      if (cam === 'feed' || cam === 'drawer') return 'camera';
      if (page === 'activate') return 'page';
      if (cam === 'fail' && page === 'fail') return 'none';
    }
    return 'none';
  };
  it('a rightward arc (to Messages) moves the page', () => {
    expect(claimFirst([[4, -5], [9, -11], [16, -14], [24, -16]], 120)).toBe('page');
  });
  it('a leftward, flatter swipe (to Profile) still moves the page', () => {
    expect(claimFirst([[-4, -1], [-12, -2], [-24, -4]], 300)).toBe('page');
  });
  it('a sideways swipe that starts with an upward wobble still moves the page', () => {
    expect(claimFirst([[2, -6], [5, -11], [9, -13], [14, -14], [22, -15]], 120)).toBe('page');
  });
  it('a short, quick sideways flick moves the page', () => {
    expect(claimFirst([[-6, 0], [-13, -2]], 300)).toBe('page');
  });
  it('a clear swipe up is still the camera’s', () => {
    expect(claimFirst([[1, -6], [2, -12], [3, -24]], 200)).toBe('camera');
  });
});
