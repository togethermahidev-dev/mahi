/**
 * Asking for notifications: when the full-screen page shows (the last onboarding page), and when
 * the feed's "turn on notifications" banner shows instead. Pure and SDK-free so the rules are
 * unit-tested; the page is src/components/PushPrimer.tsx, the banner src/components/PushBanner.tsx,
 * and the device side (permission, storage) src/lib/push.ts. Everything here sits behind
 * `push-core`.
 */

export type PushPermission = 'granted' | 'denied' | 'undetermined';

/**
 * The page's words (owner, 2026-10-09, core workflow step 10). Turn on brings up the phone's own
 * question; Not now closes the page, and the feed's banner takes over.
 */
export const PUSH_PRIMER = {
  headline: 'Don’t miss your tag 🔔',
  line: 'Turn on notifications so you know when a mate tags you.',
  turnOn: 'Turn on',
  notNow: 'Not now',
} as const;

/** The banner at the top of the feed for someone with notifications off (owner, 2026-10-09). */
export const PUSH_BANNER = {
  text: '🔕 You won’t know when you’re tagged and could miss the deadline.',
  turnOn: 'Turn on',
} as const;

/** The page waits this long after the last thing on screen has gone (a closing welcome card). */
export const PUSH_PRIMER_DELAY_MS = 600;

/**
 * The page still has to be shown on this device: the switch is on, the phone has not asked yet and
 * the page has not been answered. It is the last onboarding page, so onboarding is done once this
 * is false. `null` (not read from the phone) never holds onboarding back.
 */
export function pushPrimerPending({
  flagOn,
  permission,
  primerAnswered,
}: {
  flagOn: boolean;
  permission: PushPermission | null;
  primerAnswered: boolean | null;
}): boolean {
  return flagOn && permission === 'undetermined' && primerAnswered === false;
}

/**
 * The page shows once per device, to someone the phone has not asked yet, and never on top of an
 * earlier onboarding page (the welcome cards, the privacy choice). The camera asks for its own
 * permission only after onboarding, so the page doesn't wait on it.
 */
export function shouldShowPushPrimer({
  pagesBeforeSettled,
  ...rest
}: {
  flagOn: boolean;
  permission: PushPermission | null;
  primerAnswered: boolean | null;
  pagesBeforeSettled: boolean;
}): boolean {
  return pagesBeforeSettled && pushPrimerPending(rest);
}

/**
 * The feed's banner, for someone who said Not now on the page or "Don't allow" to the phone (or
 * closed the page with Android's back button). It shows whether or not a tag is open. What a tap
 * does: 'settings' opens Mahi's page in the phone's Settings (the phone won't ask twice); 'ask'
 * shows the phone's question, which it has not asked yet — until it has, Settings has no
 * notifications row to switch on.
 */
export function pushBanner({
  flagOn,
  permission,
  primerAnswered,
}: {
  flagOn: boolean;
  permission: PushPermission | null;
  primerAnswered: boolean | null;
}): 'settings' | 'ask' | null {
  if (!flagOn || permission === null || permission === 'granted') return null;
  if (permission === 'undetermined' && !primerAnswered) return null;
  return permission === 'denied' ? 'settings' : 'ask';
}
