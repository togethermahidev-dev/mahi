import { msLeft } from '../countdown';

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
