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
  // Roadmap goals — Phases 1-5 (see docs/feature-roadmap.md)
  'nav-rest-streak-unified', // 1.1 Unified Rest Days + Streak panel
  'messaging-search-entry', // 1.2 Search users from Messages page
  'messaging-row-split-taps', // 1.3 Split Messages row taps
  'nav-profile-entry-animation', // 1.4 Animated profile-open / overlay entry
  'feed-action-buttons-polish', // 2.1 Like/Comment buttons polish
  'profile-avatar-lightbox', // 2.2 Tap profile picture to enlarge
  'profile-posts-recovery-fix', // 2.3 Profile older-posts recovery fix
  'camera-pinch-zoom', // 3.1 Pinch-to-zoom on photo preview
  'camera-ultrawide-lens', // 3.2 0.5x ultra-wide lens
  'camera-landscape', // 3.3 Landscape photos
  'posts-location-tagging', // 4.1 Per-post location with consent cache
  'follows-suggestions', // 5.1 Suggested follows

  // Shipped-surface kill-switches
  'feed-core', // feed / likes / comments / post detail
  'messaging-core', // direct messaging / conversations / requests
  'camera-capture', // camera capture / PiP / tagging / captions
  'follows-core', // follow system
  'notifications-core', // notifications activity feed
  'moderation-core', // block / report
  'streaks-core', // streak tracking / grid / rest days
  'auth-otp-signup', // OTP email signup flow
] as const;

/** A known PostHog feature flag key. */
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/**
 * Resolve a raw PostHog flag value to a boolean, default-on.
 *
 * - `analyticsEnabled === false` (no PostHog key configured) → always `true`:
 *   the app behaves as "everything on" when analytics degrades gracefully,
 *   mirroring the optional-key handling in `src/lib/env.ts` / `src/lib/posthog.ts`.
 * - flag not yet loaded (`undefined`) → `true`: don't hide a feature during the
 *   brief window before PostHog returns flags on cold start.
 * - explicit `false` → `false`: an off flag hides its feature (the kill-switch).
 *
 * Pure and SDK-free so it can be unit-tested in isolation.
 */
export function resolveFlag(value: boolean | undefined, analyticsEnabled: boolean): boolean {
  if (!analyticsEnabled) return true;
  return value ?? true;
}
