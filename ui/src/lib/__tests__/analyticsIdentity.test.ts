import { identityStep } from '../analyticsIdentity';

// PostHog's own ids on this phone: before identify the two are the same anonymous id; after
// identify the distinct id is the Supabase user id and the anonymous id is the old one.
const ANON = 'anon-1';

describe('identityStep — one person per Supabase account, never two people merged', () => {
  it('names the anonymous phone after the account that just signed in', () => {
    expect(identityStep('user-a', ANON, ANON)).toBe('identify');
  });

  it('does nothing when the phone already carries this account (token refresh, cold start)', () => {
    expect(identityStep('user-a', 'user-a', ANON)).toBe('none');
  });

  it('starts fresh before naming a second account on the same phone', () => {
    expect(identityStep('user-b', 'user-a', ANON)).toBe('reset_then_identify');
  });

  it('forgets the account when it signs out', () => {
    expect(identityStep(null, 'user-a', ANON)).toBe('reset');
  });

  // The bug this fixes: every signed-out cold start reset PostHog, so each launch of a
  // signed-out phone counted as a brand-new person (20 extra people in 30 days).
  it('keeps the same anonymous id across signed-out launches', () => {
    expect(identityStep(null, ANON, ANON)).toBe('none');
  });
});
