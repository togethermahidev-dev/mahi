/**
 * Who PostHog thinks is using this phone, kept equal to who Supabase says is signed in.
 *
 * One person in PostHog = one Supabase account. So: name the phone after the account once,
 * forget it on sign-out, and never reset a phone that was never named — resetting a signed-out
 * phone on every launch made each launch a new "person" and inflated user counts.
 *
 * Pure (no PostHog import) so it can be tested; `syncAnalyticsIdentity` in `analytics.ts` acts on it.
 */
export type IdentityStep = 'identify' | 'reset_then_identify' | 'reset' | 'none';

/**
 * @param userId the signed-in Supabase user id, or null when signed out
 * @param distinctId PostHog's current distinct id on this phone
 * @param anonymousId PostHog's anonymous id on this phone (equal to distinctId until identify)
 */
export function identityStep(
  userId: string | null,
  distinctId: string,
  anonymousId: string
): IdentityStep {
  const named = distinctId !== anonymousId;
  if (!userId) return named ? 'reset' : 'none';
  if (distinctId === userId) return 'none';
  // Named after a different account (signed out while the app was closed, then someone else
  // signed in): start fresh so the two people are never merged into one.
  return named ? 'reset_then_identify' : 'identify';
}
