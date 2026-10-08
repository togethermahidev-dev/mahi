import { MOTION, SWIPE } from '@/constants/tokens';
import {
  drawerOffset,
  drawerShouldOpen,
  drawerShouldSettleOpen,
  pullFelt,
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

  describe('pullFelt: the one tick per pull', () => {
    it('is felt once the pull passes its mark, and only once', () => {
      const mark = MOTION.pull.limit * MOTION.pullFeltAt;
      expect(pullFelt(mark - 1, false)).toBe(false);
      expect(pullFelt(mark + 1, false)).toBe(true);
      expect(pullFelt(mark + 1, true)).toBe(false);
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

    it('closes an open drawer after the same committed distance upwards', () => {
      expect(drawerShouldSettleOpen(open * (1 - MOTION.pull.openAt) + 1, open, true)).toBe(true);
      expect(drawerShouldSettleOpen(open * (1 - MOTION.pull.openAt) - 1, open, true)).toBe(false);
    });

    it('respects an intentional flick toward either detent', () => {
      expect(drawerShouldSettleOpen(40, open, false, 1)).toBe(true);
      expect(drawerShouldSettleOpen(open - 40, open, true, -1)).toBe(false);
    });
  });
});
