/**
 * The App Clip's hand-over (build 13+).
 *
 * Someone without Mahi taps an invite link on an iPhone, and the App Clip (ui/clip/MahiClip)
 * shows who invited them. When they tap "Get Mahi" the clip saves the invite link, and when it
 * was saved, in the App Group the app shares (`group.com.mahi.app`), then opens the App Store.
 * iOS keeps that App Group when the full app is installed, so the first time Mahi opens it reads
 * the link once, deletes it straight away, and holds the invite like one it was opened with: the
 * sign-up screen says who invited them and the invite is claimed after sign-up. Nothing else is
 * saved, and the invite itself is checked fresh with the server, never shown from the phone.
 *
 * Switch `app-clip`: off, the app drops the saved link unread. The clip itself is switched off in
 * App Store Connect (remove the App Clip experience), not here.
 *
 * Pure and import-free apart from inviteLink, so it runs under the node-only jest harness.
 */
import { parseInviteLink } from './inviteLink';

/** The App Group the app, the widget and the clip share (expo-widgets' groupIdentifier). */
export const CLIP_APP_GROUP = 'group.com.mahi.app';
/** The key the clip writes (MahiClip/InviteHandover.swift says the same). */
export const CLIP_HANDOVER_KEY = 'mahi.clipInvite';
/** An invite lives 7 days at most (`app_config.invite_ttl`); older than that, it's let go. */
export const CLIP_HANDOVER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The invite (token or code) in what the clip saved — `{"link": "<invite link>", "savedAt":
 * <seconds>}` — or null when there's nothing, it's not one of our links, or it's too old.
 */
export function readClipHandover(raw: string | null | undefined, nowMs: number): string | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { link, savedAt } = value as Record<string, unknown>;
  if (typeof link !== 'string' || typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
    return null;
  }
  if (nowMs - savedAt * 1000 > CLIP_HANDOVER_MAX_AGE_MS) return null;
  return parseInviteLink(link);
}

/**
 * What to do with a saved hand-over, from switch `app-clip`'s raw PostHog value: take it once
 * PostHog says on, drop it when off (a switch missing from PostHog reads off), and wait while
 * PostHog hasn't answered — a fresh install has no saved switches, so reading the default would
 * miss an off switch. With no PostHog key everything is on, as for every switch.
 */
export function clipHandoverDecision(
  flagValue: boolean | undefined,
  analyticsEnabled: boolean
): 'take' | 'drop' | 'wait' {
  if (!analyticsEnabled) return 'take';
  if (flagValue === undefined) return 'wait';
  return flagValue ? 'take' : 'drop';
}
