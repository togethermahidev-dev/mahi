/**
 * A tap-free way between the swipe pages for screen readers and Switch Control (design round 5,
 * gap 3). Without the phone's tab bar the pages are left by a sideways swipe, which VoiceOver's
 * one-finger swipes never reach, so each page offers "Go to …" actions. Pure, unit-tested.
 */
import { NATIVE_TABS, type TabKey } from '@/lib/nativeTabs';

const PREFIX = 'go-';

export interface PageAction {
  name: string;
  label: string;
}

/** Every page but the one showing, in the swipe order. */
export function pageActions(current: TabKey): PageAction[] {
  return NATIVE_TABS.filter((t) => t.key !== current).map((t) => ({
    name: `${PREFIX}${t.key}`,
    label: `Go to ${pageTitle(t.key)}`,
  }));
}

/** A page's name, said when an action has moved there. */
export function pageTitle(tab: TabKey): string {
  return NATIVE_TABS.find((t) => t.key === tab)?.title ?? '';
}

/** The page an action goes to, or null for an action that isn't one of these. */
export function pageForAction(name: string): TabKey | null {
  if (!name.startsWith(PREFIX)) return null;
  const tab = NATIVE_TABS.find((t) => `${PREFIX}${t.key}` === name);
  return tab ? tab.key : null;
}
