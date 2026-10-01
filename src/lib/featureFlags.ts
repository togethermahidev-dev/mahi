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
  'notifications-core', // notifications activity feed
  'auth-password-reset', // "Forgot password?" emails a code, then sets a new password
  'account-delete', // Settings -> Delete account (Apple requires in-app deletion)

  // Tag loop (see docs/tag-loop-plan.md)
  'push-core', // P1 push permission prompt (server keeps queueing when off)
  'tag-challenges', // P2 open-tags banner (the 3-tag rule is switched in app_config)
  'mahi-points', // P5 points badges and profile stat
  'invite-links', // P7 invite a slot from the tag sheet, share links after posting
  'feed-lock-explainer', // locked feed says why (who tagged you); open feed says how long it stays open
  'tags-invite-step', // tag sheet leads with "Invite 3 friends" when friends can't fill the slots; invite list after posting

  // Navigation
  'nav-glass-rail', // floating glass rail on the right: Camera, Feed, Messages, Profile
  'nav-rail-morph', // rail as one floating pill with a sliding selector; hold and drag to switch

  // Onboarding
  'onboarding-welcome-cards', // one-time 3-card carousel teaching the post / tag / feed loop

  // Sign-in placeholders — pills on the welcome screen with nothing behind them yet.
  'auth-apple-signin',
  'auth-google-signin',
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
 *   Note: once flags have loaded, the SDK also returns `false` for a key that doesn't exist in
 *   PostHog — create every new flag in PostHog (at 100%) before shipping the code that reads it.
 *
 * Pure and SDK-free so it can be unit-tested in isolation.
 */
export function resolveFlag(value: boolean | undefined, analyticsEnabled: boolean): boolean {
  if (!analyticsEnabled) return true;
  return value ?? true;
}
