import { relativeTime } from '../relativeTime';

describe('how long ago a post or comment was made', () => {
  const now = Date.parse('2026-10-02T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('seconds, then minutes, hours and days', () => {
    expect(relativeTime(ago(5_000), now)).toBe('5s ago');
    expect(relativeTime(ago(3 * 60_000), now)).toBe('3m ago');
    expect(relativeTime(ago(5 * 3_600_000), now)).toBe('5h ago');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2d ago');
  });

  it('rounds down at each step', () => {
    expect(relativeTime(ago(59_999), now)).toBe('59s ago');
    expect(relativeTime(ago(60_000), now)).toBe('1m ago');
    expect(relativeTime(ago(24 * 3_600_000 - 1), now)).toBe('23h ago');
  });
});
