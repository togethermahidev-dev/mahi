// Kept apart from ./otp.ts (which touches storage and the network) so it stays pure and testable.

/** What the one-time-code field holds: digits only, at most `length` of them. */
export function sanitiseOtp(raw: string, length: number): string {
  return raw.replace(/\D/g, '').slice(0, length);
}
