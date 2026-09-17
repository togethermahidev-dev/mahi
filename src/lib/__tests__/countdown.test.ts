import { formatHms, formatWait, msLeft } from '../countdown';

describe('msLeft', () => {
  const expires = '2026-09-17T12:00:00.000Z';
  const deviceNow = Date.parse('2026-09-17T11:00:00.000Z');

  it('counts down on the server clock, not the device clock', () => {
    // Device is 10 minutes slow: the server is already at 11:10.
    expect(msLeft(expires, 10 * 60 * 1000, deviceNow)).toBe(50 * 60 * 1000);
  });

  it('never goes below zero', () => {
    expect(msLeft(expires, 2 * 3600 * 1000, deviceNow)).toBe(0);
  });
});

describe('formatHms', () => {
  it('shows hours past 24', () => {
    expect(formatHms(47 * 3600 * 1000 + 59 * 60 * 1000 + 59 * 1000)).toBe('47:59:59');
  });
  it('pads small values', () => {
    expect(formatHms(61 * 1000)).toBe('00:01:01');
  });
});

describe('formatWait', () => {
  it.each([
    [0, '1m'],
    [45 * 60, '45m'],
    [3 * 3600 + 59 * 60, '3h'],
    [26 * 3600, '1d 2h'],
  ])('%i seconds reads as %s', (seconds, expected) => {
    expect(formatWait(seconds)).toBe(expected);
  });
});
