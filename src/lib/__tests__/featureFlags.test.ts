import {
  resolveFlag,
  flagDefaultOn,
  DEFAULT_OFF_FLAGS,
  FEATURE_FLAGS,
  type FeatureFlag,
} from '@/lib/featureFlags';

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

describe('default-off flags (video-posts, context-menu-preview)', () => {
  it('lists video-posts in the registry', () => {
    expect(FEATURE_FLAGS).toContain('video-posts');
  });

  it('only video-posts, ios-sf-symbols and context-menu-preview default off', () => {
    expect(DEFAULT_OFF_FLAGS).toEqual(['video-posts', 'ios-sf-symbols', 'context-menu-preview']);
  });

  // Apple's icons need build 11; off until PostHog says true, so nothing swaps icons on cold start.
  it('lists ios-sf-symbols in the registry, default off', () => {
    expect(FEATURE_FLAGS).toContain('ios-sf-symbols');
    expect(flagDefaultOn('ios-sf-symbols' as FeatureFlag)).toBe(false);
  });

  // Owner: off for everyone, and the app never asks for the microphone while it is off.
  // So it stays off until PostHog says true — while flags load and with no PostHog key.
  it('stays off while flags load, with no PostHog key, and when false', () => {
    expect(resolveFlag(undefined, true, false)).toBe(false);
    expect(resolveFlag(true, false, false)).toBe(false);
    expect(resolveFlag(false, true, false)).toBe(false);
  });

  it('is on only when PostHog says true', () => {
    expect(resolveFlag(true, true, false)).toBe(true);
  });

  it('flagDefaultOn tells the two kinds apart', () => {
    expect(flagDefaultOn('video-posts')).toBe(false);
    expect(flagDefaultOn('context-menu-preview')).toBe(false);
    expect(flagDefaultOn('notifications-core')).toBe(true);
  });
});
