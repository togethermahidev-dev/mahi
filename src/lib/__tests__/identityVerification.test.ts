import { flagDefaultOn, FEATURE_FLAGS } from '../featureFlags';
import {
  identityCheckAvailable,
  sdkResultHint,
  overallIdentityStatus,
  IDENTITY_STATUSES,
} from '../identityVerification';

describe('identity-verification flag', () => {
  it('is a known flag', () => {
    expect(FEATURE_FLAGS).toContain('identity-verification');
  });
  // Dormant in build 11: never on while flags load or when the key is missing from PostHog.
  it('is default off', () => {
    expect(flagDefaultOn('identity-verification')).toBe(false);
  });
});

describe('identityCheckAvailable — flag on AND the Didit native module in this build', () => {
  it('is on only when both are true', () => {
    expect(identityCheckAvailable(true, true)).toBe(true);
  });
  // Build 10 gets OTA updates too but has no Didit module: that must read as off.
  it('is off on a build without the native module, even with the flag on', () => {
    expect(identityCheckAvailable(true, false)).toBe(false);
  });
  it('is off when the flag is off', () => {
    expect(identityCheckAvailable(false, true)).toBe(false);
    expect(identityCheckAvailable(false, false)).toBe(false);
  });
});

describe('sdkResultHint — what the phone saw (a hint only; the server decides)', () => {
  it('reads a finished check by its status', () => {
    expect(
      sdkResultHint({ type: 'completed', session: { sessionId: 's', status: 'Approved' } })
    ).toBe('approved');
    expect(
      sdkResultHint({ type: 'completed', session: { sessionId: 's', status: 'Declined' } })
    ).toBe('declined');
    expect(
      sdkResultHint({ type: 'completed', session: { sessionId: 's', status: 'Pending' } })
    ).toBe('pending');
  });
  it('treats an unknown finished status as pending (wait for the server)', () => {
    expect(sdkResultHint({ type: 'completed', session: { sessionId: 's', status: 'Weird' } })).toBe(
      'pending'
    );
  });
  it('reads cancelled and failed', () => {
    expect(sdkResultHint({ type: 'cancelled' })).toBe('cancelled');
    expect(sdkResultHint({ type: 'failed', error: { type: 'networkError', message: 'x' } })).toBe(
      'failed'
    );
  });
});

describe('overallIdentityStatus — from the rows the server keeps', () => {
  const row = (status: string, updated_at: string) => ({ status, updated_at });

  it('is none with no rows', () => {
    expect(overallIdentityStatus([])).toBe('none');
  });
  it('is approved when any check is approved', () => {
    expect(
      overallIdentityStatus([
        row('declined', '2026-10-02T12:00:00Z'),
        row('approved', '2026-10-01T12:00:00Z'),
      ])
    ).toBe('approved');
  });
  it('otherwise follows the newest check', () => {
    expect(
      overallIdentityStatus([
        row('declined', '2026-10-01T12:00:00Z'),
        row('in_review', '2026-10-02T12:00:00Z'),
      ])
    ).toBe('in_review');
  });
  it('ignores a status it does not know', () => {
    expect(overallIdentityStatus([row('nonsense', '2026-10-02T12:00:00Z')])).toBe('none');
  });
  it('knows the same statuses as the database', () => {
    expect([...IDENTITY_STATUSES].sort()).toEqual(
      ['approved', 'declined', 'expired', 'in_review', 'pending'].sort()
    );
  });
});
