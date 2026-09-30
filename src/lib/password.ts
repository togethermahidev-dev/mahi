// Password strength for sign-up, and the matching rules handed to iOS's strong-password generator.

export type Strength = 'low' | 'medium' | 'high';

export const MIN_PASSWORD_LENGTH = 8;

const SPECIAL = /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/;

/** 'low' (blocked at sign-up) unless 8+ characters with at least two of: upper case, digit, symbol. */
export function getPasswordStrength(pw: string): Strength | null {
  if (!pw) return null;
  const hasUpper = /[A-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = SPECIAL.test(pw);
  const classes = [hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  if (pw.length < MIN_PASSWORD_LENGTH || classes <= 1) return 'low';
  if (classes === 3) return 'high';
  return 'medium';
}

/**
 * iOS `passwordRules`: a suggested strong password always has all three classes, so it is rated
 * 'high'. The symbol set only holds characters SPECIAL counts (`-` first, as Apple's syntax needs).
 */
export const PASSWORD_RULES = `minlength: ${MIN_PASSWORD_LENGTH}; required: lower; required: upper; required: digit; required: [-!#$%&*?@^_];`;
