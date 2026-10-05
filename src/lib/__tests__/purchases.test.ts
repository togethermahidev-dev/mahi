import { flagDefaultOn, FEATURE_FLAGS } from '../featureFlags';
import {
  purchasesApiKey,
  purchasesAvailability,
  configureStep,
  hasActiveEntitlement,
  isPurchaseCancelled,
} from '../purchases';

describe('purchases flag', () => {
  it('is a known flag', () => {
    expect(FEATURE_FLAGS).toContain('purchases');
  });
  it('is default off', () => {
    expect(flagDefaultOn('purchases')).toBe(false);
  });
});

describe('purchasesApiKey — the public RevenueCat key for this platform', () => {
  const keys = { ios: 'appl_x', android: 'goog_y' };
  it('picks by platform', () => {
    expect(purchasesApiKey('ios', keys)).toBe('appl_x');
    expect(purchasesApiKey('android', keys)).toBe('goog_y');
  });
  it('is null on other platforms or when unset', () => {
    expect(purchasesApiKey('web', keys)).toBeNull();
    expect(purchasesApiKey('ios', { ios: null, android: 'goog_y' })).toBeNull();
    expect(purchasesApiKey('ios', { ios: '', android: null })).toBeNull();
  });
});

describe('purchasesAvailability — flag on AND native module AND key', () => {
  it('is ready only with all three', () => {
    expect(purchasesAvailability({ flagOn: true, nativePresent: true, apiKey: 'k' })).toBe('ready');
  });
  it('is off when the flag is off, whatever else', () => {
    expect(purchasesAvailability({ flagOn: false, nativePresent: true, apiKey: 'k' })).toBe('off');
    expect(purchasesAvailability({ flagOn: false, nativePresent: false, apiKey: null })).toBe(
      'off'
    );
  });
  // Build 10 gets OTA updates too but has no RevenueCat module.
  it('is not-in-build without the native module', () => {
    expect(purchasesAvailability({ flagOn: true, nativePresent: false, apiKey: 'k' })).toBe(
      'not-in-build'
    );
  });
  it('is no-key without a key', () => {
    expect(purchasesAvailability({ flagOn: true, nativePresent: true, apiKey: null })).toBe(
      'no-key'
    );
  });
});

describe('configureStep — configure once per app run, then switch users with logIn', () => {
  it('configures the first time', () => {
    expect(configureStep({ everConfigured: false, currentUser: null }, 'u1')).toBe('configure');
  });
  it('does nothing for the same user', () => {
    expect(configureStep({ everConfigured: true, currentUser: 'u1' }, 'u1')).toBe('none');
  });
  it('logs in a different user (or the next one after a sign-out)', () => {
    expect(configureStep({ everConfigured: true, currentUser: 'u1' }, 'u2')).toBe('log-in');
    expect(configureStep({ everConfigured: true, currentUser: null }, 'u2')).toBe('log-in');
  });
});

describe('hasActiveEntitlement', () => {
  it('is true only for an active entitlement', () => {
    const info = { entitlements: { active: { pro: { isActive: true } } } };
    expect(hasActiveEntitlement(info, 'pro')).toBe(true);
    expect(hasActiveEntitlement(info, 'other')).toBe(false);
  });
  it('is false with no customer info', () => {
    expect(hasActiveEntitlement(null, 'pro')).toBe(false);
  });
});

describe('isPurchaseCancelled — a cancelled purchase is not an error', () => {
  it('reads RevenueCat userCancelled', () => {
    expect(isPurchaseCancelled({ userCancelled: true })).toBe(true);
    expect(isPurchaseCancelled({ userCancelled: false })).toBe(false);
    expect(isPurchaseCancelled(new Error('x'))).toBe(false);
    expect(isPurchaseCancelled(null)).toBe(false);
  });
});
