import { nudgeLabel } from '../tagNudge';

describe('nudgeLabel', () => {
  const now = Date.parse('2026-09-23T12:00:00.000Z');
  const daysAgo = (d: number) => new Date(now - d * 24 * 3600 * 1000).toISOString();

  it('nudges a friend nobody has tagged for the set number of days', () => {
    expect(nudgeLabel(daysAgo(8), false, 7, now)).toBe('not tagged in 7 days — tag them');
  });

  it('nudges exactly on the day it runs out', () => {
    expect(nudgeLabel(daysAgo(7), false, 7, now)).toBe('not tagged in 7 days — tag them');
  });

  it('stays quiet for a recent tag', () => {
    expect(nudgeLabel(daysAgo(6), false, 7, now)).toBeNull();
  });

  it('nudges someone never tagged', () => {
    expect(nudgeLabel(null, false, 7, now)).toBe('not tagged yet — tag them');
  });

  it('never nudges someone you already have an open tag on', () => {
    expect(nudgeLabel(null, true, 7, now)).toBeNull();
  });
});
