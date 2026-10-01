import { streakText } from '../streakText';

describe('streakText', () => {
  it('reads "Streak N" for a running streak', () => {
    expect(streakText(1)).toBe('Streak 1');
    expect(streakText(12)).toBe('Streak 12');
  });

  it('shows nothing when the streak is 0 or unknown', () => {
    expect(streakText(0)).toBeNull();
    expect(streakText(null)).toBeNull();
    expect(streakText(undefined)).toBeNull();
  });
});
