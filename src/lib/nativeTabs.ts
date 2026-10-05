/**
 * The phone's own tab bar (build 11+, no PostHog switch — owner, 2026-10-03): pure rules, unit-tested.
 *
 * The bar itself is react-native-screens' native tabs: on iPhone UITabBarController (Liquid Glass
 * on iOS 26 with Apple's own selection morph), on Android Material's bottom navigation. Loading
 * the library safely lives in `screensModule.ts`; the navigator is `src/screens/TabsNavigator.tsx`.
 */
import type { AndroidSymbol } from 'expo-symbols';
import type { SFSymbolName } from '@/lib/sfSymbols';

export type TabKey = 'camera' | 'feed' | 'messages' | 'profile';

/**
 * The four tabs in the swipe order, Messages last (founder, 2026-10-05). iPhone: Apple's icons, plain, then filled when selected.
 * Android: Google's Material icons (Android marks the selected tab with its own pill).
 */
export const NATIVE_TABS: readonly {
  key: TabKey;
  title: string;
  icon: SFSymbolName;
  selectedIcon: SFSymbolName;
  androidIcon: AndroidSymbol;
}[] = [
  {
    key: 'camera',
    title: 'Camera',
    icon: 'camera',
    selectedIcon: 'camera.fill',
    androidIcon: 'photo_camera',
  },
  // Same three lines as the app's own Feed drawing; it has no filled version.
  {
    key: 'feed',
    title: 'Feed',
    icon: 'text.alignleft',
    selectedIcon: 'text.alignleft',
    androidIcon: 'notes',
  },
  {
    key: 'profile',
    title: 'Profile',
    icon: 'person',
    selectedIcon: 'person.fill',
    androidIcon: 'person',
  },
  {
    key: 'messages',
    title: 'Messages',
    icon: 'bubble.left',
    selectedIcon: 'bubble.left.fill',
    androidIcon: 'chat_bubble',
  },
];

/**
 * The native tab bar shows on iPhone and Android, on every build that has the native tabs
 * (build 11+). No switch: the build decides (owner, 2026-10-03). OTA updates also reach build 10,
 * which has none: there the app keeps the swipe pages.
 */
export function nativeTabsAvailable(platform: string, nativePresent: boolean): boolean {
  return (platform === 'ios' || platform === 'android') && nativePresent;
}

/**
 * How much higher the Camera's bottom controls sit so they clear the bar: `room` is the space the
 * bar takes from the bottom of the screen, `resting` where the controls sit without it, `gap` the
 * space wanted above the bar. Never negative.
 */
export function cameraLift(room: number, resting: number, gap: number): number {
  if (room <= 0) return 0;
  return Math.max(0, room + gap - resting);
}

/**
 * The swipe pages, left to right (founder, 2026-10-05): Camera ⇄ Feed ⇄ Profile, sideways only —
 * no up/down swiping. Messages is not a swipe page: its tab (or the header button) opens it over
 * them.
 */
export const SWIPE_PAGES: readonly TabKey[] = ['camera', 'feed', 'profile'];

/** The tab for the swipe page showing, or Messages while it is open. */
export function pageTab(index: number, messagesOpen: boolean): TabKey {
  if (messagesOpen) return 'messages';
  return SWIPE_PAGES[index] ?? 'camera';
}

/** The swipe page a tab shows, or null for Messages (it opens over the pages). */
export function tabPage(tab: TabKey): number | null {
  const i = SWIPE_PAGES.indexOf(tab);
  return i < 0 ? null : i;
}

/**
 * Whether a tab selection the bar reports should move the pages: a tap does; a change the app
 * asked for (the bar catching up with a swipe) does not, or the pages would move twice.
 */
export function movesPages(actionOrigin: string): boolean {
  return actionOrigin !== 'programmatic-js';
}
