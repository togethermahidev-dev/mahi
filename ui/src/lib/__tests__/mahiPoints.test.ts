import {
  mahiPointsCount,
  pointsBadgeText,
  pointsCount,
  pointsStatsLabel,
  pointsMilestone,
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
    expect(postedToast({ answered: ['sam'], points: 4, bestBefore: 9 })).toBe(
      'Answered @sam. +1 Mahi point. You have 4.'
    );
  });

  it('several answered: still one point', () => {
    expect(postedToast({ answered: ['sam', 'ali'], points: 4, bestBefore: 9 })).toBe(
      'Answered @sam and 1 other. +1 Mahi point. You have 4.'
    );
    expect(postedToast({ answered: ['sam', 'ali', 'jo'], points: 4, bestBefore: 9 })).toBe(
      'Answered @sam and 2 others. +1 Mahi point. You have 4.'
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
    expect(postedToast({ answered: ['sam'], points: 4, bestBefore: 9 })).not.toMatch(
      /streak|\d+h|\bin \d/i
    );
  });

  it('the first post says who it tagged', () => {
    expect(
      postedToast({ answered: [], points: 0, bestBefore: 0, tagged: { friends: 3, links: 0 } })
    ).toBe('Posted. You tagged 3 friends. Your feed is open for 24 hours.');
    expect(
      postedToast({ answered: [], points: 0, bestBefore: 0, tagged: { friends: 1, links: 2 } })
    ).toBe('Posted. You tagged 1 friend and 2 people by link. Your feed is open for 24 hours.');
    expect(
      postedToast({ answered: [], points: 0, bestBefore: 0, tagged: { friends: 0, links: 1 } })
    ).toBe('Posted. You tagged 1 person by link. Your feed is open for 24 hours.');
    expect(
      postedToast({ answered: [], points: 0, bestBefore: 0, tagged: { friends: 0, links: 0 } })
    ).toBe('Posted. Your feed is open for 24 hours.');
  });

  it('coming back after a miss (points reset, a best to remember): welcome back', () => {
    expect(postedToast({ answered: ['sam'], points: 1, bestBefore: 12 })).toBe(
      'Answered @sam. Welcome back. +1 Mahi point.'
    );
  });

  it('round numbers: 5, 10, 25, 50 and 100 answers without a miss', () => {
    for (const n of [5, 10, 25, 50, 100]) {
      expect(postedToast({ answered: ['sam'], points: n, bestBefore: 200 })).toBe(
        `Answered @sam. +1 Mahi point. That’s ${n} answers without a miss.`
      );
    }
  });

  it('a new best still wins over a round number', () => {
    expect(postedToast({ answered: ['sam'], points: 10, bestBefore: 9 })).toBe(
      'Answered @sam. +1 Mahi point. New best: 10.'
    );
  });

  it('back level with your best', () => {
    expect(postedToast({ answered: ['sam'], points: 12, bestBefore: 12 })).toBe(
      'Answered @sam. +1 Mahi point. That’s your best again: 12.'
    );
  });

  it('close to your best: how many more to beat it', () => {
    expect(postedToast({ answered: ['sam'], points: 11, bestBefore: 12 })).toBe(
      'Answered @sam. +1 Mahi point. 2 more to beat your best.'
    );
    expect(postedToast({ answered: ['sam'], points: 9, bestBefore: 12 })).toBe(
      'Answered @sam. +1 Mahi point. 4 more to beat your best.'
    );
    expect(postedToast({ answered: ['sam'], points: 8, bestBefore: 12 })).toBe(
      'Answered @sam. +1 Mahi point. You have 8.'
    );
  });
});

describe('pointsMilestone (the post toast lines worth a small celebration)', () => {
  it('the first point', () => {
    expect(pointsMilestone(1, 0)).toBe(true);
  });
  it('a new best', () => {
    expect(pointsMilestone(13, 12)).toBe(true);
  });
  it('5, 10, 25, 50 and 100 answers without a miss', () => {
    for (const n of [5, 10, 25, 50, 100]) expect(pointsMilestone(n, 200)).toBe(true);
  });
  it('not an ordinary point, a fresh start after a miss, or a tie with the best', () => {
    expect(pointsMilestone(7, 20)).toBe(false);
    expect(pointsMilestone(1, 12)).toBe(false);
    expect(pointsMilestone(12, 12)).toBe(false);
  });
  it('not when the numbers are unknown (the toast says nothing special then either)', () => {
    expect(pointsMilestone(5, null)).toBe(false);
    expect(pointsMilestone(null, 3)).toBe(false);
  });
  it('matches the toast: every milestone gets its own line', () => {
    const plain = (points: number, best: number) =>
      postedToast({ answered: ['sam'], points, bestBefore: best }).endsWith(`You have ${points}.`);
    for (const [points, best] of [
      [1, 0],
      [13, 12],
      [10, 200],
    ]) {
      expect(plain(points, best)).toBe(false);
    }
    expect(plain(7, 20)).toBe(true);
  });
});
