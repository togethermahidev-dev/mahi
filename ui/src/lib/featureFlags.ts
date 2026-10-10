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
  'camera-tap-focus', // tap the live camera to focus and expose there (build 11+, default OFF)

  // Tag loop (see docs/tag-loop-plan.md)
  'push-core', // the "Don't miss your tag 🔔" page and the feed's turn-on-notifications banner (default OFF; server keeps queueing when off)

  // Posts
  'video-posts', // each shot can be a photo or a video of up to 15 s; feed plays them (default OFF)

  // Look
  'ios-sf-symbols', // iPhone shows Apple's own icons in place of the drawn ones; needs build 11 (default OFF)

  // Dormant in build 11: native pieces are in the build, switched on later by OTA + flag
  'identity-verification', // Didit identity check (default OFF)
  'purchases', // RevenueCat in-app purchases and paywall (default OFF)

  // Build 13 native features — kill switches, on for everyone (owner, 2026-10-07). Off = the
  // feature hides and the app behaves as before it.
  'contacts-finder', // Find friends in your contacts
  'live-activity', // (default OFF, not released yet) a mate's tag on the lock screen, Dynamic Island and home-screen widget
  'emoji-keyboard', // the emoji button and panel (search, suggestions) in a conversation
  'message-reactions', // hold a message to react, reaction badges, double tap for a heart
  'point-fly-in', // a later answer's +1 flies into the points counter (off: the full-screen moment)
  'feed-develop', // after you post, your mates' locked posts clear one by one
  'tag-drain-ring', // last 6 hours: the tagger's face in a draining ring on the camera pill
  'answered-stamp', // "Answered @sam" stamped on the photo, and the pill-to-tick morph
  'camera-tab-badge', // a number on the Camera tab while a tag waits
  'miss-roll-down', // after a miss the counter rolls down to 0 before the miss moment
  'profile-points-card', // the profile's bar fills, numbers roll, and the last three mates answered
  'widget-tagger-photo', // the tagger's photo on the widget and Live Activity
  'app-clip', // the app takes the invite the App Clip handed over (off: drops it unread); the clip itself is off via App Store Connect

  'share-to-mahi', // share 1–2 photos from Photos to Mahi: they open as the post's shots (off: the share is ignored and deleted)
  'control-post-workout', // (default OFF, not released yet) Control Centre / lock screen "Post a workout" opens the camera (off: the control reads "Open Mahi" and just opens Mahi)
  'spotlight', // (default OFF, not released yet) Spotlight offers Post a workout, Your invites, Find friends in your contacts (off: the items are removed from the phone's index)
  'siri-shortcuts', // (default OFF, not released yet) "Post a workout in Mahi", "Open my invites in Mahi", "Find friends on Mahi" (off: they just open Mahi)
  'shutter-sound', // Apple's shutter sound at the press, in step with the haptic; silent switch respected (off: today's camera sound)
  'widget-background-refresh', // iOS wakes Mahi every 15 min or more to refresh the widget and Live Activity (off: the task is unregistered)

  // Sign-in
  'auth-apple-signin', // Sign in with Apple on the welcome screen; build 13+ iPhones only (default OFF, not released yet)
  'auth-google-signin', // placeholder pill with nothing behind it yet

  // Feed (owner, 2026-10-09)
  'feed-rows', // the feed as rows (on) or full-screen posts, one per screen (off, the default)

  // Public and private accounts (owner, 2026-10-08)
  'private-accounts', // Settings → Security and privacy → Privacy controls, the choice after sign-up, follow requests, remove a follower (default OFF)

  // Sharing (owner, 2026-10-10) — a kill switch, on for everyone
  'share-sheet', // Share and Invite a mate open Mahi's own share sheet, and a shared post shows as a card in a chat (off: straight to the phone's share sheet; a post message is a plain bubble)

  // Profiles (owner, 2026-10-10)
  'profile-bio-and-counts', // follower and following counts and a bio on your profile and other people's (default OFF; the bio needs migration 20261010110000_profile_bio)
] as const;

/** A known PostHog feature flag key. */
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/**
 * Flags that are OFF unless PostHog explicitly says true — while flags load, with no PostHog
 * key, and when the key is missing. `push-core`: the full-screen notifications page must never
 * flash up while flags load, nor before push is set up on the server.
 * `video-posts`: the owner wants it off for everyone, and
 * with it off the app must never ask for the microphone, not even for a moment on cold start.
 * `ios-sf-symbols`: Apple's icons need build 11; off until switched on, so icons never swap
 * from drawn to Apple's in front of someone while flags load.
 * `camera-tap-focus`: needs build 11's native focus, so it waits to be switched on.
 * `identity-verification` and `purchases`: dormant until the owner sets up Didit / RevenueCat.
 * `auth-google-signin`: the Google button is a placeholder that does nothing yet, so it must
 * never show on the first screen while flags load, nor on a build with no PostHog key.
 * Sign in with Apple, the lock-screen tracker and widget, the Control Centre button, Siri and
 * Spotlight: not released yet (owner, 2026-10-08), so none of
 * them shows for a moment on cold start.
 * `private-accounts`: Controls and the sign-up choice need migration
 * 20261008170000_private_accounts; off until the owner switches it on.
 * `feed-rows`: owner, 2026-10-09 — the feed is full-screen posts again, rows hidden for everyone;
 * off while flags load too, so rows never show first and then swap to full screen.
 * `profile-bio-and-counts`: a new feature (owner, 2026-10-10), so it starts off; the profile
 * header never changes shape in front of someone while flags load.
 */
export const DEFAULT_OFF_FLAGS: readonly FeatureFlag[] = [
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
