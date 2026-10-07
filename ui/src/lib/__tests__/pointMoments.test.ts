import { MOTION } from '@/constants/tokens';
import {
  burstDots,
  flightCard,
  flyPoint,
  nativeDigits,
  pointMoment,
  pointsRoll,
  rollValue,
  willFly,
} from '../pointMoments';

describe('the point earned moment (#116)', () => {
  describe('pointMoment: which moment a post gets', () => {
    it('keeps the full-screen moment for the first ever point', () => {
      expect(pointMoment({ firstPost: true, answered: 0, replayed: false })).toBe('celebrate');
      expect(pointMoment({ firstPost: true, answered: 2, replayed: false })).toBe('celebrate');
    });
    it('flies the +1 into the counter for every later answer', () => {
      expect(pointMoment({ firstPost: false, answered: 1, replayed: false })).toBe('fly');
      expect(pointMoment({ firstPost: false, answered: 3, replayed: false })).toBe('fly');
    });
    it('gives nothing to a post that earned no point', () => {
      expect(pointMoment({ firstPost: false, answered: 0, replayed: false })).toBeNull();
    });
    it('gives nothing to a post the server had already counted', () => {
      expect(pointMoment({ firstPost: false, answered: 1, replayed: true })).toBeNull();
      expect(pointMoment({ firstPost: true, answered: 0, replayed: true })).toBeNull();
    });
  });

  describe('willFly: the counter waits for the +1 from the moment Post is pressed', () => {
    it('waits when the post answers a tag and is not the first', () => {
      expect(willFly({ firstPost: false, answersTag: true })).toBe(true);
    });
    it('does not wait for a first post (it gets the full screen) or a post that answers nothing', () => {
      expect(willFly({ firstPost: true, answersTag: true })).toBe(false);
      expect(willFly({ firstPost: false, answersTag: false })).toBe(false);
    });
  });

  describe('flyPoint: the curve from the shutter to the counter', () => {
    const from = { x: 200, y: 700 };
    const to = { x: 340, y: 60 };
    it('starts at the shutter and ends in the counter', () => {
      expect(flyPoint(0, from, to)).toEqual({ x: 200, y: 700, scale: 1 });
      const end = flyPoint(1, from, to);
      expect(end.x).toBeCloseTo(340);
      expect(end.y).toBeCloseTo(60);
      expect(end.scale).toBeCloseTo(MOTION.flyToScale);
    });
    it('arcs above the straight line half way', () => {
      const mid = flyPoint(0.5, from, to);
      expect(mid.x).toBeCloseTo(270);
      expect(mid.y).toBeCloseTo(380 - MOTION.flyArc);
    });
    it('never goes past the counter, whatever the spring does', () => {
      expect(flyPoint(1.2, from, to)).toEqual(flyPoint(1, from, to));
      expect(flyPoint(-0.2, from, to)).toEqual(flyPoint(0, from, to));
    });
  });

  describe('burstDots: the milestone dots', () => {
    it('spreads the dots evenly round a circle', () => {
      const dots = burstDots();
      expect(dots).toHaveLength(MOTION.burstDots);
      for (const d of dots) expect(Math.hypot(d.x, d.y)).toBeCloseTo(MOTION.burstSpread);
      expect(dots[0]).toEqual({ x: MOTION.burstSpread, y: 0 });
      expect(dots[MOTION.burstDots / 2].x).toBeCloseTo(-MOTION.burstSpread);
    });
  });

  describe('flightCard: the small card under the counter', () => {
    it('names the friend who kept you going', () => {
      expect(flightCard({ tagger: 'sam', points: 12, bestBefore: 20 })).toEqual({
        title: '@sam kept you going',
        line: 'You have 12 Mahi points.',
        milestone: false,
        liveText: 'Plus 1 Mahi point, 12 Mahi points. @sam kept you going.',
      });
    });
    it('says a new best', () => {
      expect(flightCard({ tagger: 'sam', points: 13, bestBefore: 12 })).toEqual({
        title: '@sam kept you going',
        line: 'New best: 13 Mahi points.',
        milestone: true,
        liveText: 'Plus 1 Mahi point, 13 Mahi points. New best. @sam kept you going.',
      });
    });
    it('says a round number', () => {
      const card = flightCard({ tagger: 'jo', points: 10, bestBefore: 30 });
      expect(card.line).toBe('That’s 10 Mahi points without a miss.');
      expect(card.milestone).toBe(true);
    });
    it('welcomes you back after a miss, without a milestone', () => {
      const card = flightCard({ tagger: 'jo', points: 1, bestBefore: 30 });
      expect(card.line).toBe('Welcome back. You have 1 Mahi point.');
      expect(card.milestone).toBe(false);
    });
    it('still works without a name', () => {
      expect(flightCard({ tagger: null, points: 2, bestBefore: 5 }).title).toBe(
        'A friend kept you going'
      );
    });
  });

  describe('nativeDigits: whose rolling numbers', () => {
    it('uses Apple’s on an iPhone build with @expo/ui', () => {
      expect(nativeDigits({ platform: 'ios', expoUiPresent: true, reduceMotion: false })).toBe(
        true
      );
    });
    it('uses ours on build 10, Android and with Reduce Motion', () => {
      expect(nativeDigits({ platform: 'ios', expoUiPresent: false, reduceMotion: false })).toBe(
        false
      );
      expect(nativeDigits({ platform: 'android', expoUiPresent: true, reduceMotion: false })).toBe(
        false
      );
      expect(nativeDigits({ platform: 'ios', expoUiPresent: true, reduceMotion: true })).toBe(
        false
      );
    });
  });
});

describe('the counter rolling (#116, and down after a miss)', () => {
  it('rolls up on a point and down after a miss, within this session only', () => {
    expect(pointsRoll(4, 5)).toBe('up');
    expect(pointsRoll(6, 0)).toBe('down');
    expect(pointsRoll(null, 0)).toBeNull();
    expect(pointsRoll(3, 3)).toBeNull();
    expect(pointsRoll(3, null)).toBeNull();
  });
  it('eases from the old number to the new, either way', () => {
    expect(rollValue(6, 0, 0)).toBe(6);
    expect(rollValue(6, 0, 1)).toBe(0);
    expect(rollValue(4, 5, 1)).toBe(5);
    const mid = rollValue(6, 0, 0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(6);
  });
  it('never passes the new number', () => {
    expect(rollValue(6, 0, 1.4)).toBe(0);
    expect(rollValue(0, 6, -1)).toBe(0);
  });
});
