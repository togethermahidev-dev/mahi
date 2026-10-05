import { relativeTime } from '../relativeTime';

describe('how long ago something was made, in words', () => {
  const now = Date.parse('2026-10-02T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('just now, then minutes, hours and days written out', () => {
    expect(relativeTime(ago(5_000), now)).toBe('just now');
    expect(relativeTime(ago(60_000), now)).toBe('1 minute ago');
    expect(relativeTime(ago(3 * 60_000), now)).toBe('3 minutes ago');
    expect(relativeTime(ago(3_600_000), now)).toBe('1 hour ago');
    expect(relativeTime(ago(5 * 3_600_000), now)).toBe('5 hours ago');
    expect(relativeTime(ago(86_400_000), now)).toBe('1 day ago');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2 days ago');
  });

  it('rounds down at each step', () => {
    expect(relativeTime(ago(59_999), now)).toBe('just now');
    expect(relativeTime(ago(24 * 3_600_000 - 1), now)).toBe('23 hours ago');
  });

  it('a phone clock a little behind the server still says just now', () => {
    expect(relativeTime(ago(-5_000), now)).toBe('just now');
  });
});
