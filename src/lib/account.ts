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

/** The one native confirmation before an account is deleted. */
export const DELETE_ACCOUNT_CONFIRM = {
  title: 'Delete your account?',
  message:
    'This deletes your profile, posts, photos, messages and streak for good. It can’t be undone.',
  cancel: 'Cancel',
  confirm: 'Delete account',
} as const;
