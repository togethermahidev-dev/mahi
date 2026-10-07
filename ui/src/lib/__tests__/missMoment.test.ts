import { missSeenKey, missToShow, parseSeenMisses, seenMissesAfter } from '../missMoment';

const DAY = 24 * 3600 * 1000;
const now = Date.parse('2026-10-07T12:00:00.000Z');
const row = (id: string, type: string, ago: number, username = 'sam') => ({
  id,
  type,
  created_at: new Date(now - ago).toISOString(),
  actor: { username },
});

// Usability walkthrough 2026-10-07: the next open after a miss shows one moment, once per miss.
describe('missToShow', () => {
  it('the newest miss not yet shown', () => {
    const items = [
      row('n3', 'like', 1000),
      row('n2', 'streak_lost', 2000, 'ali'),
      row('n1', 'streak_lost', DAY, 'sam'),
    ];
    expect(missToShow(items, [], now)).toEqual({ id: 'n2', tagger: 'ali' });
  });

  it('never a miss already shown on this phone', () => {
    const items = [row('n2', 'streak_lost', 2000, 'ali')];
    expect(missToShow(items, ['n2'], now)).toBeNull();
  });

  it('a newer miss shows even after an older one was seen', () => {
    const items = [row('n2', 'streak_lost', 2000, 'ali'), row('n1', 'streak_lost', DAY)];
    expect(missToShow(items, ['n1'], now)?.id).toBe('n2');
  });

  it('only misses from the last 3 days (not an old one the first time this update opens)', () => {
    expect(missToShow([row('n1', 'streak_lost', 4 * DAY)], [], now)).toBeNull();
    expect(missToShow([row('n1', 'streak_lost', 2 * DAY)], [], now)?.id).toBe('n1');
  });

  it('only misses', () => {
    expect(missToShow([row('n1', 'tag_missed', 1000)], [], now)).toBeNull();
  });
});

describe('seen misses, kept on the phone (a seen mark never expires)', () => {
  it('one key per account', () => {
    expect(missSeenKey('u1')).toBe('@mahi:miss_moments_seen:u1');
  });

  it('reads back what it saved, and anything broken as none', () => {
    expect(parseSeenMisses(JSON.stringify(['a', 'b']))).toEqual(['a', 'b']);
    expect(parseSeenMisses(null)).toEqual([]);
    expect(parseSeenMisses('nope')).toEqual([]);
    expect(parseSeenMisses(JSON.stringify([1, 'a']))).toEqual(['a']);
  });

  it('adds one, keeping the last 50', () => {
    expect(seenMissesAfter(['a'], 'b')).toEqual(['a', 'b']);
    expect(seenMissesAfter(['a'], 'a')).toEqual(['a']);
    const many = Array.from({ length: 50 }, (_, i) => `m${i}`);
    const after = seenMissesAfter(many, 'new');
    expect(after).toHaveLength(50);
    expect(after[49]).toBe('new');
    expect(after[0]).toBe('m1');
  });
});
