// Kept apart from ./otp.ts (which touches storage and the network) so it stays pure and testable.
import type { OTPState } from './otp';

/** How long a code works — must match CODE_TTL_MS in supabase/functions/_shared/otp.ts. */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** send-otp allows one code per email per minute, so Resend unlocks after this. */
export const RESEND_AFTER_MS = 60 * 1000;
/** A code with less than this left isn't worth reusing; send a fresh one instead. */
const REUSE_MIN_LEFT_MS = 60 * 1000;

/** What the one-time-code field holds: digits only, at most `length` of them. */
export function sanitiseOtp(raw: string, length: number): string {
  return raw.replace(/\D/g, '').slice(0, length);
}

/**
 * True when the code already sent to this email is still good, so going Back and pressing
 * Next again returns to the code screen instead of asking the server for another code
 * (which it refuses inside a minute, and which would cancel the code in the inbox).
 */
export function reusableCode(state: OTPState | null, email: string, now: number): boolean {
  if (!state || state.email !== email.toLowerCase().trim()) return false;
  return state.sentAt + CODE_TTL_MS - now >= REUSE_MIN_LEFT_MS;
}

/** The code screen's countdown and how long until Resend unlocks, from when the code was sent. */
export function codeTimes(
  sentAt: number,
  now: number
): { secondsLeft: number; resendInMs: number } {
  const age = now - sentAt;
  return {
    secondsLeft: Math.max(0, Math.round((CODE_TTL_MS - age) / 1000)),
    resendInMs: Math.max(0, RESEND_AFTER_MS - age),
  };
}
