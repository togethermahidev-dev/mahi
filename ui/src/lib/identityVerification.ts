/**
 * Identity checks (Didit), flag `identity-verification`, default off. Pure rules only — no SDK,
 * no network — so they are unit-tested (src/lib/__tests__/identityVerification.test.ts).
 *
 * Flow: the app asks the `didit-session` function for a session token, opens Didit's native
 * check with it (src/lib/diditModule.ts), then reads the real result from
 * `identity_verifications`, which only the `didit-webhook` function writes. What the phone saw
 * at the end of the check is a hint for the next screen, never the decision.
 */

/** Statuses the server keeps (identity_verifications.status). Same list as the migration. */
export const IDENTITY_STATUSES = [
  'pending',
  'in_review',
  'approved',
  'declined',
  'expired',
] as const;
export type ServerIdentityStatus = (typeof IDENTITY_STATUSES)[number];

/** The person's overall state: a server status, or none when they never started a check. */
export type IdentityStatus = ServerIdentityStatus | 'none';

/** What the phone saw when the Didit screens closed. */
export type IdentityHint = 'approved' | 'pending' | 'declined' | 'cancelled' | 'failed';

/** On only with the flag on AND Didit's native module in this build (build 10 has none). */
export function identityCheckAvailable(flagOn: boolean, nativePresent: boolean): boolean {
  return flagOn && nativePresent;
}

/** The SDK's result, reduced to the fields read here (matches its VerificationResult). */
export type SdkResultLike =
  | { type: 'completed'; session: { sessionId: string; status: string } }
  | { type: 'cancelled'; session?: { sessionId: string; status: string } }
  | { type: 'failed'; error: { type: string; message: string } };

export function sdkResultHint(result: SdkResultLike): IdentityHint {
  switch (result.type) {
    case 'completed':
      if (result.session.status === 'Approved') return 'approved';
      if (result.session.status === 'Declined') return 'declined';
      return 'pending';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'failed';
  }
}

function isServerStatus(s: string): s is ServerIdentityStatus {
  return (IDENTITY_STATUSES as readonly string[]).includes(s);
}

/**
 * One status from the person's checks: approved if any check is approved (a later failed retry
 * doesn't undo it; Didit's "Kyc Expired" turns that row to expired), otherwise the newest check.
 */
export function overallIdentityStatus(
  rows: readonly { status: string; updated_at: string }[]
): IdentityStatus {
  const known = rows.filter((r) => isServerStatus(r.status));
  if (known.some((r) => r.status === 'approved')) return 'approved';
  const newest = [...known].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  return newest ? (newest.status as ServerIdentityStatus) : 'none';
}
