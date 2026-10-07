/**
 * Mahi's own actions from outside the app (build 13+): the Control Centre / lock screen button
 * "Post a workout" (switch `control-post-workout`), Spotlight's items (switch `spotlight`), and
 * the App Shortcuts for Siri, Shortcuts and Spotlight (switch `siri-shortcuts`).
 * `mahi://invites` and `mahi://find-mates` also work as plain links.
 *
 * The Swift side (ui/modules/mahi-apple-extras/swift/MahiIntents.swift) can't open a screen itself: it
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

/** The camera, the invites list, or "Find your mates" (both open over the Camera page). */
export type AppAction = 'camera' | 'invites' | 'find-mates';

/** Who asked: an ordinary link, or one of the build 13 extras (each with its own switch). */
export type AppActionSource = 'link' | 'control' | 'spotlight' | 'siri';

/** The switch each extra answers to. */
const SOURCE_SWITCH: Record<Exclude<AppActionSource, 'link'>, FeatureFlag> = {
  control: 'control-post-workout',
  spotlight: 'spotlight',
  siri: 'siri-shortcuts',
};

/** The switches the Swift side reads from the App Group (Spotlight's is acted on by the app). */
export const APP_GROUP_SWITCHES: readonly FeatureFlag[] = [
  'control-post-workout',
  'siri-shortcuts',
];

/**
 * What Spotlight offers when someone searches for Mahi (switch `spotlight`): the app's own
 * actions only, nothing about the person. Indexed on the phone by src/hooks/useAppleExtras.ts,
 * removed when the switch is off. A tap opens Mahi with the link (MahiSpotlightAppDelegateSubscriber).
 */
export const SPOTLIGHT_ACTIONS: readonly {
  link: string;
  title: string;
  detail: string;
  keywords: string[];
}[] = [
  {
    link: 'mahi://camera?from=spotlight',
    title: 'Post a workout',
    detail: 'Open the camera in Mahi',
    keywords: ['workout', 'post', 'camera', 'gym', 'mahi'],
  },
  {
    link: 'mahi://invites?from=spotlight',
    title: 'Your invites',
    detail: 'See the links you sent and who joined',
    keywords: ['invites', 'invite', 'links', 'mahi'],
  },
  {
    link: 'mahi://find-mates?from=spotlight',
    title: 'Find your mates',
    detail: 'See who from your contacts is on Mahi',
    keywords: ['mates', 'friends', 'contacts', 'find', 'mahi'],
  },
];

const ACTION_LINK = /^mahi:\/\/\/?(camera|invites|find-mates)\/?(?:\?([^#]*))?(?:#.*)?$/i;

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
