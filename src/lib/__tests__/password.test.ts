import { getPasswordStrength, MIN_PASSWORD_LENGTH, PASSWORD_RULES } from '../password';

describe('getPasswordStrength', () => {
  it.each([
    ['', null],
    ['Ab1!', 'low'], // too short
    ['abcdefgh', 'low'], // no classes
    ['Abcdefgh', 'low'], // one class
    ['Abcdefg1', 'medium'],
    ['abcdef1!', 'medium'],
    ['Abcdef1!', 'high'],
  ])('%j is %s', (pw, expected) => {
    expect(getPasswordStrength(pw)).toBe(expected);
  });
});

describe('PASSWORD_RULES (iOS strong-password generator)', () => {
  const rule = (name: string) =>
    PASSWORD_RULES.split(';')
      .map((r) => r.trim())
      .filter((r) => r.startsWith(`${name}:`))
      .map((r) => r.slice(name.length + 1).trim());

  it('asks for at least the minimum length', () => {
    expect(rule('minlength')).toEqual([String(MIN_PASSWORD_LENGTH)]);
  });

  it('requires upper case, a digit and a symbol, so a generated password is rated high', () => {
    expect(rule('required')).toEqual(expect.arrayContaining(['upper', 'digit']));
    expect(rule('required').some((r) => r.startsWith('['))).toBe(true);
  });

  it('only uses symbols the strength check counts as special', () => {
    const custom = rule('required').find((r) => r.startsWith('['))!;
    const symbols = custom.slice(1, -1).split('');
    expect(symbols.length).toBeGreaterThan(0);
    for (const s of symbols) {
      expect(getPasswordStrength(`Abcdefg1${s}`)).toBe('high');
    }
  });

  it('a password shaped like a generated one is rated high', () => {
    expect(getPasswordStrength('xukbem-Qojty3-gafmyx')).toBe('high');
  });
});
