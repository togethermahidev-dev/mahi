/**
 * Mahi's own actions from outside the app (build 13+): the Control Centre / lock screen button
 * "Post a workout" (switch `control-post-workout`).
 *
 * The Swift side (ui/targets/controls/_shared/MahiIntents.swift) can't open a screen itself: it
 * leaves a link such as `mahi://camera?from=control` in the shared App Group and opens Mahi; the
 * app takes it (src/hooks/useAppActions.ts) and runs it here, if that source's switch is on. The
 * switches the Swift reads are written to the App Group by src/hooks/useAppleExtras.ts.
 *
 * Pure. Tested in src/lib/__tests__/appActions.test.ts, which also checks the Swift uses the same
 * names.
 */
import type { FeatureFlag } from './featureFlags';

/** The App Group the app, the widget, the share extension and the controls share. */
export const APP_GROUP = 'group.com.mahi.app';

/** Where an intent leaves the link for the app to take. */
export const PENDING_LINK_KEY = 'mahi.pendingLink';

/** Where a switch is kept in the App Group, as true / false. */
export function switchKey(flag: FeatureFlag): string {
  return `switch.${flag}`;
}

export type AppAction = 'camera';

/** Who asked: an ordinary link, or one of the build 13 extras (each with its own switch). */
export type AppActionSource = 'link' | 'control';

/** The switch each extra answers to. */
const SOURCE_SWITCH: Record<Exclude<AppActionSource, 'link'>, FeatureFlag> = {
  control: 'control-post-workout',
};

/** The switches the Swift side reads from the App Group. */
export const APP_GROUP_SWITCHES: readonly FeatureFlag[] = Object.values(SOURCE_SWITCH);

const ACTION_LINK = /^mahi:\/\/\/?(camera)\/?(?:\?([^#]*))?(?:#.*)?$/i;

/** The action a link asks for, and who asked; null for any other link. */
export function parseAppAction(
  url: string | null | undefined
): { action: AppAction; source: AppActionSource } | null {
  const m = url ? ACTION_LINK.exec(url.trim()) : null;
  if (!m) return null;
  const from = /(?:^|&)from=([^&]*)/.exec(m[2] ?? '')?.[1];
  const source: AppActionSource =
    from && Object.prototype.hasOwnProperty.call(SOURCE_SWITCH, from)
      ? (from as AppActionSource)
      : 'link';
  return { action: m[1].toLowerCase() as AppAction, source };
}

/** What to do for a link, or null: not an action, or its source's switch is off. */
export function appActionToRun(
  url: string | null | undefined,
  flagOn: (flag: FeatureFlag) => boolean
): AppAction | null {
  const parsed = parseAppAction(url);
  if (!parsed) return null;
  if (parsed.source !== 'link' && !flagOn(SOURCE_SWITCH[parsed.source])) return null;
  return parsed.action;
}

/** What to write to the App Group: each switch the Swift reads, as true / false. */
export function appGroupSwitchValues(
  flagOn: (flag: FeatureFlag) => boolean
): Record<string, boolean> {
  return Object.fromEntries(APP_GROUP_SWITCHES.map((f) => [switchKey(f), flagOn(f)]));
}
