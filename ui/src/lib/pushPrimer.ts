/**
 * Asking for notifications: when the full-screen page shows, and when the camera's small
 * "turn on notifications" line shows instead. Pure and SDK-free so the rules are unit-tested;
 * the page is src/components/PushPrimer.tsx, the line src/components/PushNudge.tsx, and the
 * device side (permission, storage) src/lib/push.ts. Everything here sits behind `push-core`.
 */

export type PushPermission = 'granted' | 'denied' | 'undetermined';

/**
 * The page's words (founder, 2026-10-02). One button, "Continue", that always brings up the
 * phone's own question (owner, 2026-10-06, following Apple's guidance for a page before a
 * permission question: one button, no way to cancel). The phone's "Don't Allow" is the way out.
 * Quiet hours are #11 (22:00–07:00 in each person's time zone, `push_send_time`).
 */
export const PUSH_PRIMER = {
  headline: 'When do you post on Mahi?',
  why: 'When a mate tags you. Turn on notifications so you know the moment your 48 hours start.',
  cardTitle: 'Please turn on notifications',
  cardBody:
    'Mahi only pings you when it matters: a mate tags you, your time is running out, or your feed is about to lock. Never between 10pm and 7am.',
  continue: 'Continue',
} as const;

/** The camera's line for someone who hasn't turned notifications on. */
export const PUSH_NUDGE_TEXT = 'Turn on notifications so you never miss a tag';

/** The page waits this long after the last thing on screen has gone (a closing welcome card). */
export const PUSH_PRIMER_DELAY_MS = 600;

/**
 * The page shows once per device, to someone the phone has not asked yet, and never on top of
 * the welcome cards or the phone's own camera question. `null` = not read from the phone yet.
 */
export function shouldShowPushPrimer({
  flagOn,
  permission,
  primerAnswered,
  welcomeSettled,
  cameraSettled,
}: {
  flagOn: boolean;
  permission: PushPermission | null;
  primerAnswered: boolean | null;
  welcomeSettled: boolean;
  cameraSettled: boolean;
}): boolean {
  return (
    flagOn &&
    permission === 'undetermined' &&
    primerAnswered === false &&
    welcomeSettled &&
    cameraSettled
  );
}

/**
 * The camera's line, for someone who told the phone "Don't allow" (or closed the page with
 * Android's back button before the phone asked), while they hold an open tag. What a tap does: 'settings' opens Mahi's page in the
 * phone's Settings (the phone won't ask twice); 'ask' shows the phone's question, which it has
 * not asked yet — until it has, Settings has no notifications row to switch on.
 * Dismissing it hides it for the tags open at that moment; the next tag brings it back.
 */
export function pushNudge({
  flagOn,
  permission,
  primerAnswered,
  openTags,
  dismissedThrough,
}: {
  flagOn: boolean;
  permission: PushPermission | null;
  primerAnswered: boolean | null;
  openTags: { created_at: string }[];
  /** `nudgeDismissMark` of the tags that were open when the line was last dismissed. */
  dismissedThrough: string | null;
}): 'settings' | 'ask' | null {
  if (!flagOn || permission === null || permission === 'granted') return null;
  if (permission === 'undetermined' && !primerAnswered) return null;
  const seen = dismissedThrough ? Date.parse(dismissedThrough) : -Infinity;
  if (!openTags.some((t) => Date.parse(t.created_at) > seen)) return null;
  return permission === 'denied' ? 'settings' : 'ask';
}

/** What to remember when the line is dismissed: when the newest open tag was made. */
export function nudgeDismissMark(openTags: { created_at: string }[]): string | null {
  if (openTags.length === 0) return null;
  return openTags.reduce((a, b) => (Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a))
    .created_at;
}
