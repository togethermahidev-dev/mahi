import { isBelowVersion } from '../appVersion';

describe('isBelowVersion', () => {
  it.each([
    ['0.1.0', '0.2.0', true],
    ['0.9.0', '0.10.0', true], // numeric, not alphabetical
    ['1.0.0', '1.0.0', false],
    ['1.2.3', '1.2.2', false],
    ['2.0.0', '1.99.99', false],
  ])('%s below %s → %s', (current, minimum, expected) => {
    expect(isBelowVersion(current, minimum)).toBe(expected);
  });

  it('never blocks when a version is unreadable', () => {
    expect(isBelowVersion('', '9.9.9')).toBe(false);
    expect(isBelowVersion('1.0.0', 'soon')).toBe(false);
  });
});
