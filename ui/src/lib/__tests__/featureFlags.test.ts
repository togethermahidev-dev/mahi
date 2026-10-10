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
});

// Owner, 2026-10-06: reports and hold to preview are standard for everyone, no switch.
it('reports and hold to preview have no switch', () => {
  expect(FEATURE_FLAGS).not.toContain('content-reports');
  expect(FEATURE_FLAGS).not.toContain('context-menu-preview');
});

// Owner, 2026-10-07: these were on at 100% since about 2026-10-01 and are now standard, no switch.
it('the twelve switches made standard on 2026-10-07 are gone', () => {
  const removed = [
    'account-delete',
    'auth-password-reset',
    'camera-pip-guide',
    'camera-pull-down',
    'comment-likes',
    'feed-lock-explainer',
    'invite-links',
    'nav-glass-rail',
    'nav-rail-morph',
    'notifications-core',
    'onboarding-welcome-cards',
    'tag-challenges',
    'tag-slots',
    'tags-invite-step',
  ];
  for (const key of removed) {
    expect(FEATURE_FLAGS as readonly string[]).not.toContain(key);
  }
});

describe('default-off flags (video-posts)', () => {
  it('lists video-posts in the registry', () => {
    expect(FEATURE_FLAGS).toContain('video-posts');
  });

  it('only the push, video, build-11 and build-13 flags default off', () => {
    expect(DEFAULT_OFF_FLAGS).toEqual([
      'push-core',
      'video-posts',
      'ios-sf-symbols',
      'camera-tap-focus',
      'identity-verification',
      'purchases',
      'auth-google-signin',
      'auth-apple-signin',
      'live-activity',
      'control-post-workout',
      'siri-shortcuts',
      'spotlight',
      'private-accounts',
      'feed-rows',
      'profile-bio-and-counts',
    ]);
  });

  // Follower and following counts and the bio on profiles (owner, 2026-10-10): a new feature, so
  // it starts off and never shows for a moment while flags load. One switch covers both.
  it('keeps profile-bio-and-counts off until switched on', () => {
    expect(FEATURE_FLAGS).toContain('profile-bio-and-counts');
    expect(flagDefaultOn('profile-bio-and-counts')).toBe(false);
  });

  // Owner, 2026-10-09: the feed as rows hides behind a switch, off for everyone, so the feed is
  // full-screen posts again. Off while flags load too, so rows never flash up first.
  it('keeps feed-rows off until switched on', () => {
    expect(FEATURE_FLAGS as readonly string[]).toContain('feed-rows');
    expect(flagDefaultOn('feed-rows' as FeatureFlag)).toBe(false);
  });

  // Public and private accounts (owner, 2026-10-08): Controls, the choice at sign-up, follow
  // requests and removing a follower stay hidden until the owner switches it on.
  it('keeps private-accounts off until switched on', () => {
    expect(FEATURE_FLAGS).toContain('private-accounts');
    expect(flagDefaultOn('private-accounts')).toBe(false);
  });

  // Google sign-in is a placeholder button that does nothing yet: it must never show on the
  // first screen while flags load, nor on a build with no PostHog key.
  it('keeps auth-google-signin off until switched on', () => {
    expect(FEATURE_FLAGS).toContain('auth-google-signin');
    expect(flagDefaultOn('auth-google-signin')).toBe(false);
  });

  // Finding mates from contacts needs build 13 and migration 20261007270000_contact_match, and the
  // after-sign-up step must never pop up while flags load: off until PostHog says true.

  // The full-screen notifications page must never flash up while flags load, or before push is
  // set up on the server: off until PostHog says true.
  it('lists push-core in the registry, off by default', () => {
    expect(FEATURE_FLAGS).toContain('push-core');
    expect(flagDefaultOn('push-core')).toBe(false);
  });

  // Apple's icons need build 11; off until PostHog says true, so nothing swaps icons on cold start.
  it('lists ios-sf-symbols in the registry, default off', () => {
    expect(FEATURE_FLAGS).toContain('ios-sf-symbols');
    expect(flagDefaultOn('ios-sf-symbols' as FeatureFlag)).toBe(false);
  });

  // Tap to focus needs build 11's native focus; it must not switch on by itself while flags load.
  it('lists camera-tap-focus in the registry, off by default', () => {
    expect(FEATURE_FLAGS).toContain('camera-tap-focus');
    expect(flagDefaultOn('camera-tap-focus' as FeatureFlag)).toBe(false);
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
    expect(flagDefaultOn('shutter-sound')).toBe(true);
  });
});

// Build 13's native extras each have a kill switch, on for everyone (owner, 2026-10-07): they read
// as on while flags load, and only an explicit false in PostHog turns one off.
describe('build 13 native kill switches', () => {
  const BUILD_13 = ['share-to-mahi', 'shutter-sound', 'widget-background-refresh'];

  it('are in the registry and on by default', () => {
    for (const key of BUILD_13) {
      expect(FEATURE_FLAGS as readonly string[]).toContain(key);
      expect(flagDefaultOn(key as FeatureFlag)).toBe(true);
    }
  });
});

// The native tab bar has no switch (owner, 2026-10-03): build 11 decides who gets it.
describe('nav-native-tabs', () => {
  it('is not a PostHog switch', () => {
    expect(FEATURE_FLAGS as readonly string[]).not.toContain('nav-native-tabs');
  });
});

// Pinch to zoom ships to everyone with no switch (founder, 2026-10-05: "no posthog flag needed").
describe('pinch-zoom', () => {
  it('is not a PostHog switch', () => {
    expect(FEATURE_FLAGS as readonly string[]).not.toContain('pinch-zoom');
  });
});

// Owner, 2026-10-07: every build 13 native moment has a kill switch, on for everyone.
describe('build 13 kill switches', () => {
  const KILL_SWITCHES = [
    'point-fly-in',
    'feed-develop',
    'tag-drain-ring',
    'answered-stamp',
    'camera-tab-badge',
    'miss-roll-down',
    'profile-points-card',
    'widget-tagger-photo',
  ];
  it('lists each one, on unless PostHog says off', () => {
    for (const key of KILL_SWITCHES) {
      expect(FEATURE_FLAGS as readonly string[]).toContain(key);
      expect(flagDefaultOn(key as FeatureFlag)).toBe(true);
    }
  });
});

// Owner, 2026-10-08: not released yet. Off until PostHog says true — while flags load and with no
// PostHog key too — so none of them shows for a moment on cold start.
describe('build 13 features held back', () => {
  const HELD_BACK = [
    'auth-apple-signin',
    'live-activity',
    'control-post-workout',
    'siri-shortcuts',
    'spotlight',
  ];
  it('each is in the registry and off by default', () => {
    for (const key of HELD_BACK) {
      expect(FEATURE_FLAGS as readonly string[]).toContain(key);
      expect(flagDefaultOn(key as FeatureFlag)).toBe(false);
    }
  });
});

// Owner, 2026-10-10: the share sheet "like Instagram's". A kill switch, on for everyone: it reads
// as on while flags load, and only an explicit false in PostHog brings back the old Share.
describe('share-sheet', () => {
  it('is in the registry and on by default', () => {
    expect(FEATURE_FLAGS as readonly string[]).toContain('share-sheet');
    expect(flagDefaultOn('share-sheet' as FeatureFlag)).toBe(true);
    expect(DEFAULT_OFF_FLAGS as readonly string[]).not.toContain('share-sheet');
  });
});
