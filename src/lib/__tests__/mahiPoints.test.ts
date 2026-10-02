import { pointsBadgeText, pointsCount, pointsStatsLabel } from '../mahiPoints';

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

describe('pointsBadgeText', () => {
  it('reads "N points" on a post that carries points', () => {
    expect(pointsBadgeText(1)).toBe('1 point');
    expect(pointsBadgeText(12)).toBe('12 points');
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
