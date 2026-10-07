import {
  mahiPointsCount,
  missMoment,
  pointCelebration,
  pointsRowText,
  pointsBadgeText,
  pointsCount,
  pointsStatsLabel,
  pointsMilestone,
  pointsValue,
  postedToast,
  lastAnsweredMates,
  answeredMatesLine,
  taggedClockLine,
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
    ).toBe('Posted. You tagged 3 mates. Your feed is open for 24 hours.');
    expect(
      postedToast({ answered: [], points: 0, bestBefore: 0, tagged: { friends: 1, links: 2 } })
    ).toBe('Posted. You tagged 1 mate and 2 people by link. Your feed is open for 24 hours.');
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
        `Answered @sam. +1 Mahi point. That’s ${n} Mahi points without a miss.`
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

describe('pointCelebration — the moment a post earns a point', () => {
  it('a free first post: the first point, the links to send, the open feed, how Mahi works', () => {
    expect(
      pointCelebration({
        answered: [],
        points: 1,
        bestBefore: 0,
        firstPost: true,
        tagged: { friends: 0, links: 3 },
      })
    ).toEqual({
      title: 'Your first Mahi point!',
      total: 'You have 1 Mahi point.',
      lines: [
        'Send your 3 links next. Each mate gets 48 hours once they join. Your feed is open for 24 hours.',
        'From now on you post when a mate tags you. Answer each tag within 48 hours for another point.',
        'Miss a tag and your points go back to 0. Your best stays.',
      ],
    });
  });

  it('a first post that answers a mate: names them', () => {
    const c = pointCelebration({
      answered: ['sam'],
      points: 1,
      bestBefore: 0,
      firstPost: true,
      tagged: { friends: 3, links: 0 },
    });
    expect(c?.title).toBe('Your first Mahi point!');
    expect(c?.lines[0]).toBe(
      'You answered @sam’s tag. Your 3 mates have 48 hours to answer you. Your feed is open for 24 hours.'
    );
  });

  // Usability walkthrough 2026-10-07: name who is now on the clock.
  it('names the mates it tagged, who now have 48 hours', () => {
    const c = pointCelebration({
      answered: [],
      points: 1,
      bestBefore: 0,
      firstPost: true,
      tagged: { friends: 3, links: 0, names: ['a', 'b', 'c'] },
    });
    expect(c?.lines[0]).toBe(
      '@a, @b and @c now have 48 hours to answer you. Your feed is open for 24 hours.'
    );
  });

  it('names and links together keep the links line', () => {
    const c = pointCelebration({
      answered: [],
      points: 1,
      bestBefore: 0,
      firstPost: true,
      tagged: { friends: 1, links: 2, names: ['a'] },
    });
    expect(c?.lines[0]).toBe(
      '@a now has 48 hours to answer you. Send your 2 links next. Each mate gets 48 hours once they join. Your feed is open for 24 hours.'
    );
  });

  it('a later answer that tagged mates names them too', () => {
    expect(
      pointCelebration({
        answered: ['sam'],
        points: 3,
        bestBefore: 5,
        firstPost: false,
        tagged: { friends: 3, links: 0, names: ['a', 'b', 'c'] },
      })?.lines
    ).toEqual([
      'You answered @sam.',
      '@a, @b and @c now have 48 hours to answer you.',
      'Keep answering every tag to grow your points.',
    ]);
  });

  it('a later answer: +1, the total, and a nudge to keep going', () => {
    expect(
      pointCelebration({
        answered: ['sam', 'ali'],
        points: 3,
        bestBefore: 5,
        firstPost: false,
        tagged: { friends: 0, links: 0 },
      })
    ).toEqual({
      title: '+1 Mahi point',
      total: 'You have 3 Mahi points.',
      lines: ['You answered @sam and 1 other.', 'Keep answering every tag to grow your points.'],
    });
  });

  it('a new best is called out', () => {
    expect(
      pointCelebration({
        answered: ['sam'],
        points: 6,
        bestBefore: 5,
        firstPost: false,
        tagged: { friends: 0, links: 0 },
      })?.title
    ).toBe('New best: 6 Mahi points!');
  });

  it('back from a miss: a fresh start, no reminder of what was lost', () => {
    expect(
      pointCelebration({
        answered: ['sam'],
        points: 1,
        bestBefore: 5,
        firstPost: false,
        tagged: { friends: 0, links: 0 },
      })?.lines[1]
    ).toBe('Welcome back. Keep answering every tag to grow your points.');
  });

  it('nothing to celebrate when no point was earned', () => {
    expect(
      pointCelebration({
        answered: [],
        points: 2,
        bestBefore: 5,
        firstPost: false,
        tagged: { friends: 3, links: 0 },
      })
    ).toBeNull();
  });
});

// Usability walkthrough 2026-10-07: the next open after a miss says so, once.
// Walkthrough 2026-10-07: with the +1 flight on, an answer never said whose 48 hours it started.
// The words shown after the flight's card are the full-screen moment's own.
describe('taggedClockLine — who now has 48 hours', () => {
  it('names the mates', () => {
    expect(taggedClockLine({ friends: 3, links: 0, names: ['jo', 'kim', 'lee'] })).toBe(
      '@jo, @kim and @lee now have 48 hours to answer you.'
    );
    expect(taggedClockLine({ friends: 1, links: 0, names: ['jo'] })).toBe(
      '@jo now has 48 hours to answer you.'
    );
  });

  it('counts mates it can’t name, and keeps the links line', () => {
    expect(taggedClockLine({ friends: 2, links: 1 })).toBe(
      'Your 2 mates have 48 hours to answer you. Send your 1 link next. Each mate gets 48 hours once they join.'
    );
  });

  it('nothing when the post tagged nobody', () => {
    expect(taggedClockLine({ friends: 0, links: 0 })).toBeNull();
  });

  it('is the same line the full-screen moment shows', () => {
    const tagged = { friends: 3, links: 0, names: ['a', 'b', 'c'] };
    expect(
      pointCelebration({ answered: ['sam'], points: 3, bestBefore: 5, firstPost: false, tagged })
        ?.lines[1]
    ).toBe(taggedClockLine(tagged));
  });
});

describe('missMoment — the moment after a miss', () => {
  it('names whose tag, the reset and the best that stays', () => {
    expect(missMoment({ tagger: 'sam', best: 5 })).toEqual({
      title: 'You missed @sam’s tag',
      total: 'Your points are back to 0. Your best of 5 stays.',
      lines: ['Post when a mate tags you to start again.'],
      badge: '0',
      badgeLabel: 'Mahi points back to 0',
    });
  });

  it('best not known: the best still stays', () => {
    expect(missMoment({ tagger: 'sam', best: null }).total).toBe(
      'Your points are back to 0. Your best stays.'
    );
  });
});

describe('pointsRowText — the points row on the waiting card', () => {
  it('points and best', () => {
    expect(pointsRowText(4, 6)).toBe('4 Mahi points · Best 6');
    expect(pointsRowText(1, 1)).toBe('1 Mahi point · Best 1');
  });

  it('nothing until the profile has loaded (never a 0 that then changes)', () => {
    expect(pointsRowText(null, null)).toBeNull();
  });
});

describe('lastAnsweredMates (the mates on the profile’s points card)', () => {
  const post = (id: string, tagger: string | null, created_at: string) => ({
    id,
    created_at,
    response: tagger ? { tagger_username: tagger, seconds: 1 } : null,
  });
  it('names the last three mates answered, newest first, each once', () => {
    expect(
      lastAnsweredMates([
        post('1', 'sam', '2026-10-07T10:00:00Z'),
        post('2', 'jo', '2026-10-06T10:00:00Z'),
        post('3', 'sam', '2026-10-05T10:00:00Z'),
        post('4', null, '2026-10-04T10:00:00Z'),
        post('5', 'al', '2026-10-03T10:00:00Z'),
        post('6', 'bo', '2026-10-02T10:00:00Z'),
      ])
    ).toEqual(['sam', 'jo', 'al']);
  });
  it('orders by date, whatever order the posts came in', () => {
    expect(
      lastAnsweredMates([
        post('2', 'jo', '2026-10-06T10:00:00Z'),
        post('1', 'sam', '2026-10-07T10:00:00Z'),
      ])
    ).toEqual(['sam', 'jo']);
  });
  it('is empty with no answers yet', () => {
    expect(lastAnsweredMates([post('4', null, '2026-10-04T10:00:00Z')])).toEqual([]);
    expect(lastAnsweredMates([])).toEqual([]);
  });
});

describe('answeredMatesLine', () => {
  it('says who your points are made of', () => {
    expect(answeredMatesLine(['sam'])).toBe('Your last answer: @sam');
    expect(answeredMatesLine(['sam', 'jo', 'al'])).toBe('Your last answers: @sam, @jo and @al');
    expect(answeredMatesLine([])).toBeNull();
  });
});
