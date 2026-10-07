import { MOTION } from '@/constants/tokens';
import { URGENT_TAG_MS } from '../openTagsBanner';
import { crossedLastHour, urgentPillLines, urgentRing } from '../urgentRing';

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;

describe('the last 6 hours of a tag (the clock gets a heartbeat)', () => {
  describe('urgentRing: the ring around the tagger’s face', () => {
    it('is full as the last 6 hours begin and empty at the deadline', () => {
      expect(urgentRing(URGENT_TAG_MS)).toEqual({ progress: 1, breathing: false });
      expect(urgentRing(0).progress).toBe(0);
    });
    it('drains with the time left', () => {
      expect(urgentRing(3 * HOUR).progress).toBeCloseTo(0.5);
    });
    it('breathes in the last hour only', () => {
      expect(urgentRing(61 * MIN).breathing).toBe(false);
      expect(urgentRing(59 * MIN).breathing).toBe(true);
      expect(urgentRing(5 * MIN).breathing).toBe(true);
    });
    it('never shows more than full or less than empty', () => {
      expect(urgentRing(10 * HOUR).progress).toBe(1);
      expect(urgentRing(-5 * MIN).progress).toBe(0);
    });
    it('breathes down to the token opacity', () => {
      expect(MOTION.urgentBreatheLow).toBeLessThan(1);
    });
  });

  describe('crossedLastHour: the one gentle tap', () => {
    it('is true on the tick that crosses into the last hour', () => {
      expect(crossedLastHour(60 * MIN + 500, 60 * MIN - 500)).toBe(true);
    });
    it('is false before, and on every later tick', () => {
      expect(crossedLastHour(2 * HOUR, 2 * HOUR - 1000)).toBe(false);
      expect(crossedLastHour(30 * MIN, 30 * MIN - 1000)).toBe(false);
    });
    it('is false when the camera opens already inside the last hour (nothing was crossed)', () => {
      expect(crossedLastHour(null, 30 * MIN)).toBe(false);
    });
  });

  describe('urgentPillLines: the words and the clock on separate lines', () => {
    it('splits the clock off the words', () => {
      expect(
        urgentPillLines([
          { text: '@sam is waiting on you · ' },
          { text: '05:12:33 left', accent: true },
        ])
      ).toEqual({ words: '@sam is waiting on you', clock: '05:12:33', after: ' left' });
    });
    it('keeps words that have no clock', () => {
      expect(
        urgentPillLines([
          { text: '@sam is waiting on you · ' },
          { text: 'last minutes', accent: true },
        ])
      ).toEqual({ words: '@sam is waiting on you', clock: null, after: 'last minutes' });
    });
  });
});
