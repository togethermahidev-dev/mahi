import {
  mahiPointsCount,
  pointsBadgeText,
  pointsCount,
  pointsStatsLabel,
  pointsValue,
  postedToast,
} from '../mahiPoints';

describe('pointsCount', () => {
  it('reads "N points", with "1 point" for one', () => {
    expect(pointsCount(0)).toBe('0 points');
    expect(pointsCount(1)).toBe('1 point');
    expect(pointsCount(48)).toBe('48 points');
  });

  it('reads 0 points when the number is unknown', () => {
    expect(pointsCount(null)).toBe('0 points');
    expect(pointsCount(undefined)).toBe('0 points');
  });
});

describe('mahiPointsCount', () => {
  it('names the points in full: "N Mahi points", "1 Mahi point"', () => {
    expect(mahiPointsCount(0)).toBe('0 Mahi points');
    expect(mahiPointsCount(1)).toBe('1 Mahi point');
    expect(mahiPointsCount(12)).toBe('12 Mahi points');
  });

  it('reads 0 when the number is unknown', () => {
    expect(mahiPointsCount(null)).toBe('0 Mahi points');
    expect(mahiPointsCount(undefined)).toBe('0 Mahi points');
  });
});

describe('pointsBadgeText', () => {
  it('reads "N Mahi points" on a post that carries points (feed, post and grid alike)', () => {
    expect(pointsBadgeText(1)).toBe('1 Mahi point');
    expect(pointsBadgeText(12)).toBe('12 Mahi points');
  });

  it('shows nothing at 0 or when unknown', () => {
    expect(pointsBadgeText(0)).toBeNull();
    expect(pointsBadgeText(null)).toBeNull();
    expect(pointsBadgeText(undefined)).toBeNull();
  });

  it('never says streak', () => {
    expect(pointsBadgeText(3)).not.toMatch(/streak/i);
  });
});

describe('pointsStatsLabel', () => {
  it('reads the points and the best for VoiceOver', () => {
    expect(pointsStatsLabel(12, 48)).toBe('12 Mahi points. Best, 48 points.');
    expect(pointsStatsLabel(1, 1)).toBe('1 Mahi point. Best, 1 point.');
  });

  it('reads 0 for unknown numbers', () => {
    expect(pointsStatsLabel(undefined, null)).toBe('0 Mahi points. Best, 0 points.');
  });
});

describe('pointsValue', () => {
  it('shows a dash until the number is known, never a 0 that then changes', () => {
    expect(pointsValue(null)).toBe('–');
    expect(pointsValue(undefined)).toBe('–');
  });

  it('shows the number once known, 0 included', () => {
    expect(pointsValue(0)).toBe('0');
    expect(pointsValue(12)).toBe('12');
  });
});

describe('postedToast', () => {
  it('a post that answered nothing (the first post)', () => {
    expect(postedToast({ answered: [], points: 0, bestBefore: 0 })).toBe(
      'Posted. Your feed is open for 24 hours.'
    );
  });

  it('one tag answered: the point and the total', () => {
    expect(postedToast({ answered: ['sam'], points: 5, bestBefore: 9 })).toBe(
      'Answered @sam. +1 Mahi point. You have 5.'
    );
  });

  it('several answered: still one point', () => {
    expect(postedToast({ answered: ['sam', 'ali'], points: 5, bestBefore: 9 })).toBe(
      'Answered @sam and 1 other. +1 Mahi point. You have 5.'
    );
    expect(postedToast({ answered: ['sam', 'ali', 'jo'], points: 5, bestBefore: 9 })).toBe(
      'Answered @sam and 2 others. +1 Mahi point. You have 5.'
    );
  });

  it('the first point ever', () => {
    expect(postedToast({ answered: ['sam'], points: 1, bestBefore: 0 })).toBe(
      'Answered @sam. You earned your first Mahi point.'
    );
  });

  it('a new best', () => {
    expect(postedToast({ answered: ['sam'], points: 13, bestBefore: 12 })).toBe(
      'Answered @sam. +1 Mahi point. New best: 13.'
    );
  });

  it('no number from the server', () => {
    expect(postedToast({ answered: ['sam'], points: null, bestBefore: null })).toBe(
      'Answered @sam. +1 Mahi point.'
    );
  });

  it('never says streak, never a time', () => {
    expect(postedToast({ answered: ['sam'], points: 5, bestBefore: 9 })).not.toMatch(
      /streak|\d+h|\bin \d/i
    );
  });
});
