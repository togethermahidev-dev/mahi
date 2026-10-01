import { resolveFlag, FEATURE_FLAGS, type FeatureFlag } from '@/lib/featureFlags';

describe('resolveFlag — default-on feature-flag resolution', () => {
  describe('analytics disabled (no PostHog key configured)', () => {
    it('is always on, regardless of the raw flag value', () => {
      expect(resolveFlag(false, false)).toBe(true);
      expect(resolveFlag(true, false)).toBe(true);
      expect(resolveFlag(undefined, false)).toBe(true);
    });
  });

  describe('analytics enabled', () => {
    it('defaults on while flags are still loading (undefined)', () => {
      expect(resolveFlag(undefined, true)).toBe(true);
    });

    it('is on when the flag is explicitly true', () => {
      expect(resolveFlag(true, true)).toBe(true);
    });

    // The RED case: an off flag hides its feature. If this ever returns true,
    // the kill-switch is broken.
    it('is off when the flag is explicitly false (kill-switch case)', () => {
      expect(resolveFlag(false, true)).toBe(false);
    });
  });
});

describe('FEATURE_FLAGS registry', () => {
  it('has no duplicate keys', () => {
    expect(new Set(FEATURE_FLAGS).size).toBe(FEATURE_FLAGS.length);
  });

  it('uses kebab-case keys only', () => {
    for (const key of FEATURE_FLAGS) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('includes the demo-gate flag wired into AppHeader', () => {
    const demoGate: FeatureFlag = 'notifications-core';
    expect(FEATURE_FLAGS).toContain(demoGate);
  });
});
