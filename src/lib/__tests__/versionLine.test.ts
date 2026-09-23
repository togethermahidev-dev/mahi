import { formatVersionLine } from '../versionLine';

describe('formatVersionLine', () => {
  it('reads v{runtime} {build}.{ota} with a two-digit OTA', () => {
    expect(formatVersionLine('0.1.0', '10', 9)).toBe('v0.1.0 10.09');
  });
  it('shows a fresh build as .00', () => {
    expect(formatVersionLine('0.1.0', '11', 0)).toBe('v0.1.0 11.00');
  });
  it('keeps three-digit OTA counts whole', () => {
    expect(formatVersionLine('0.1.0', '11', 123)).toBe('v0.1.0 11.123');
  });
  it('shows ? for a build number it cannot read', () => {
    expect(formatVersionLine('0.1.0', null, 1)).toBe('v0.1.0 ?.01');
  });
});
