// Words and checks for the account screens: password reset (flag auth-password-reset) and
// account deletion (flag account-delete). Pure, so it is unit-tested.
import { getPasswordStrength } from './password';

/** Digits in an emailed code. Same as OTP_LENGTH in ./otp (kept apart: that file is not pure). */
export const CODE_LENGTH = 6;

/** Same words as reset-password sends back for a weak password. */
export const WEAK_PASSWORD_MESSAGE =
  'Use 8 or more characters with two of: a capital letter, a number, a symbol.';

/** What stops the new-password step, or null when it can go to the server. */
export function resetFormError(input: { code: string; password: string }): string | null {
  if (!/^\d+$/.test(input.code) || input.code.length !== CODE_LENGTH) {
    return `Enter the ${CODE_LENGTH}-digit code.`;
  }
  const strength = getPasswordStrength(input.password);
  if (strength === null || strength === 'low') return WEAK_PASSWORD_MESSAGE;
  return null;
}

/** Shown after a reset when the automatic log-in didn't work: good news, not an error. */
export const PASSWORD_CHANGED_NOTICE = 'Your password is changed. Log in with your new password.';

/** Where an auth error happened; each has its own plain fallback. */
export type AuthStep = 'login' | 'send-code' | 'check-code' | 'reset' | 'create';

const FALLBACK: Record<AuthStep, string> = {
  login: 'Couldn’t log you in. Try again.',
  'send-code': 'Couldn’t send the code. Try again.',
  'check-code': 'Couldn’t check the code. Try again.',
  reset: 'Couldn’t change your password. Try again.',
  create: 'Couldn’t create your account. Try again.',
};

/**
 * What to show for an error from log-in, the code emails, reset or sign-up. Known answers (from
 * Supabase Auth and the send-otp / verify-otp / complete-signup / send-reset-code /
 * reset-password functions) get plain words; anything else gets the step's fallback, never the
 * server's own text.
 */
export function authErrorText(
  raw: string | null | undefined,
  step: AuthStep,
  opts: { canReset?: boolean } = {}
): string {
  const m = raw ?? '';
  if (/network|failed to fetch|no connection|timed? ?out/i.test(m)) {
    return 'Couldn’t reach Mahi. Check your connection and try again.';
  }
  if (/invalid login credentials/i.test(m)) {
    return opts.canReset
      ? 'That email and password don’t match. Check them, or reset your password.'
      : 'That email and password don’t match. Check them and try again.';
  }
  if (/invalid or expired code|code has expired/i.test(m)) {
    return 'That code didn’t work or has run out. Check the latest email, or send a new one.';
  }
  if (/wait a minute/i.test(m)) return 'Wait a minute before asking for another code.';
  if (/too many/i.test(m)) return 'Too many tries. Wait a while, then try again.';
  if (/already has an account|already registered/i.test(m)) {
    return 'That email already has an account. Log in instead.';
  }
  if (/two of: a capital letter/i.test(m)) return WEAK_PASSWORD_MESSAGE;
  if (/valid email/i.test(m)) return 'Enter a valid email.';
  if (/enter the \d+-digit code/i.test(m)) return `Enter the ${CODE_LENGTH}-digit code.`;
  return FALLBACK[step];
}

/** The one native confirmation before an account is deleted. */
export const DELETE_ACCOUNT_CONFIRM = {
  title: 'Delete your account?',
  message:
    'This deletes your profile, posts, photos, messages and points for good. It can’t be undone.',
  cancel: 'Cancel',
  confirm: 'Delete account',
} as const;
