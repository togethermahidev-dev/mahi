/**
 * Feature flag registry — the single source of truth for every PostHog flag key.
 *
 * Each key below exists in PostHog (EU project 130791) and is currently rolled
 * out 100% to all users. When you add a flag in PostHog, add its key here so call
 * sites stay typed and discoverable, then read it with `useFeatureFlag(key)`.
 *
 * Keep this module free of native/SDK imports: the pure `resolveFlag` logic is
 * unit-tested under the node-only jest harness, which cannot load the
 * `posthog-react-native` native module.
 *
 * See docs/feature-flags.md for the rollout convention and key list.
 */

export const FEATURE_FLAGS = [
  // Kill-switches
  'camera-pip-guide', // live camera shows a small window: what comes second, then the first photo
  'camera-tap-focus', // tap the live camera to focus and expose there (build 11+, default OFF)
  'notifications-core', // notifications activity feed
  'auth-password-reset', // "Forgot password?" emails a code, then sets a new password
  'account-delete', // Settings -> Delete account (Apple requires in-app deletion)

  // Tag loop (see docs/tag-loop-plan.md)
  'push-core', // P1 push permission prompt (server keeps queueing when off)
  'tag-challenges', // P2 open-tags banner (the 3-tag rule is switched in app_config)
  'invite-links', // P7 invite a slot from the tag sheet, share links after posting
  'feed-lock-explainer', // locked feed says why (who tagged you); open feed says how long it stays open
  'tags-invite-step', // tag sheet leads with "Invite 3 friends" when friends can't fill the slots; invite list after posting

  // Navigation
  'nav-glass-rail', // floating glass rail on the left: Camera, Feed, Messages, Profile
  'nav-rail-morph', // rail as one floating pill with a sliding selector; hold and drag to switch

  // Onboarding
  'onboarding-welcome-cards', // one-time 3-card carousel teaching the post / tag / feed loop

  // Posts
  'video-posts', // each shot can be a photo or a video of up to 15 s; feed plays them (default OFF)
  'comment-likes', // a heart and count on each comment; tap the count to see who liked it
  'context-menu-preview', // iPhone hold-to-preview pop-up on grid, Messages, feed (build 11, default OFF)

  // Look
  'ios-sf-symbols', // iPhone shows Apple's own icons in place of the drawn ones; needs build 11 (default OFF)

  // Dormant in build 11: native pieces are in the build, switched on later by OTA + flag
  'identity-verification', // Didit identity check (default OFF)
  'purchases', // RevenueCat in-app purchases and paywall (default OFF)

  // Sign-in placeholders — pills on the welcome screen with nothing behind them yet.
  'auth-apple-signin',
  'auth-google-signin',
] as const;

/** A known PostHog feature flag key. */
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/**
 * Flags that are OFF unless PostHog explicitly says true — while flags load, with no PostHog
 * key, and when the key is missing. `video-posts`: the owner wants it off for everyone, and
 * with it off the app must never ask for the microphone, not even for a moment on cold start.
 * `ios-sf-symbols`: Apple's icons need build 11; off until switched on, so icons never swap
 * from drawn to Apple's in front of someone while flags load.
 * `context-menu-preview`: waits for build 11; off, hold to view stays exactly as today.
 * `camera-tap-focus`: needs build 11's native focus, so it waits to be switched on.
 * `identity-verification` and `purchases`: dormant until the owner sets up Didit / RevenueCat.
 */
export const DEFAULT_OFF_FLAGS: readonly FeatureFlag[] = [
  'video-posts',
  'ios-sf-symbols',
  'context-menu-preview',
  'camera-tap-focus',
  'identity-verification',
  'purchases',
];

/** Whether a flag reads as on before PostHog has answered (true for all but DEFAULT_OFF_FLAGS). */
export function flagDefaultOn(flag: FeatureFlag): boolean {
  return !DEFAULT_OFF_FLAGS.includes(flag);
}

/**
 * Resolve a raw PostHog flag value to a boolean, default-on (or default-off when
 * `defaultOn` is false: then only an explicit `true` with analytics on turns it on).
 *
 * - `analyticsEnabled === false` (no PostHog key configured) → always `true`:
 *   the app behaves as "everything on" when analytics degrades gracefully,
 *   mirroring the optional-key handling in `src/lib/env.ts` / `src/lib/posthog.ts`.
 * - flag not yet loaded (`undefined`) → `true`: don't hide a feature during the
 *   brief window before PostHog returns flags on cold start.
 * - explicit `false` → `false`: an off flag hides its feature (the kill-switch).
 *   Note: once flags have loaded, the SDK also returns `false` for a key that doesn't exist in
 *   PostHog — create every new flag in PostHog (at 100%) before shipping the code that reads it.
 *
 * Pure and SDK-free so it can be unit-tested in isolation.
 */
export function resolveFlag(
  value: boolean | undefined,
  analyticsEnabled: boolean,
  defaultOn = true
): boolean {
  if (!defaultOn) return analyticsEnabled && value === true;
  if (!analyticsEnabled) return true;
  return value ?? true;
}
