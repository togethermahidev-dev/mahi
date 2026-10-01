import { buildMonthGrid, cellKind, isOnStreak, toDateStr } from '../streakGrid';

describe('toDateStr', () => {
  it('writes the local date as YYYY-MM-DD, zero-padded', () => {
    expect(toDateStr(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('buildMonthGrid', () => {
  const months = buildMonthGrid('2026-09-30');

  it('covers 12 months, oldest first, ending with the current month', () => {
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ label: 'Oct', year: 2025 });
    expect(months[11]).toMatchObject({ label: 'Sep', year: 2026 });
  });

  it('offsets the 1st to its Monday-first weekday column', () => {
    // 1 Sep 2026 is a Tuesday → one blank; 1 Feb 2026 is a Sunday → six blanks.
    expect(months[11].leadingBlanks).toBe(1);
    expect(months.find((m) => m.label === 'Feb')?.leadingBlanks).toBe(6);
  });

  it('lists every day of past months and stops at today in the current month', () => {
    expect(months.find((m) => m.label === 'Feb')?.days).toHaveLength(28);
    expect(months[0].days[30]).toBe('2025-10-31');
    const current = buildMonthGrid('2026-09-14')[11];
    expect(current.days).toHaveLength(14);
    expect(current.days[13]).toBe('2026-09-14');
  });
});

describe('cellKind', () => {
  const base = {
    todayStr: '2026-09-30',
    postDates: new Set(['2026-09-28', '2026-09-30']),
    trainingDays: new Set(['Monday', 'Wednesday']),
  };

  it('a day with a post is posted, even today', () => {
    expect(cellKind('2026-09-28', 0, base)).toBe('posted');
    expect(cellKind('2026-09-30', 2, base)).toBe('posted');
  });

  it('today without a post is today', () => {
    expect(cellKind('2026-09-30', 2, { ...base, postDates: new Set<string>() })).toBe('today');
  });

  it('a past training day without a post is missed; a past non-training day is rest', () => {
    expect(cellKind('2026-09-23', 2, base)).toBe('missed');
    expect(cellKind('2026-09-24', 3, base)).toBe('rest');
  });

  it('with no training days set, every past day without a post is missed', () => {
    expect(cellKind('2026-09-24', 3, { ...base, trainingDays: null })).toBe('missed');
  });

  it('a future day is rest', () => {
    expect(cellKind('2026-10-01', 3, base)).toBe('rest');
  });
});

describe('isOnStreak', () => {
  it('is on a streak when the last upload was today or yesterday', () => {
    expect(isOnStreak(3, '2026-09-30', '2026-09-30')).toBe(true);
    expect(isOnStreak(3, '2026-09-29', '2026-09-30')).toBe(true);
  });

  it('is off when the last upload is older, missing, or the count is zero', () => {
    expect(isOnStreak(3, '2026-09-28', '2026-09-30')).toBe(false);
    expect(isOnStreak(3, null, '2026-09-30')).toBe(false);
    expect(isOnStreak(0, '2026-09-30', '2026-09-30')).toBe(false);
  });

  it('knows yesterday across a month end', () => {
    expect(isOnStreak(1, '2026-09-30', '2026-10-01')).toBe(true);
  });
});
