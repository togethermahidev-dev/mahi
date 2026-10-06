/**
 * The phone's own tab bar (build 11+, no PostHog switch — owner, 2026-10-03): pure rules, unit-tested.
 *
 * The bar itself is react-native-screens' native tabs: on iPhone UITabBarController (Liquid Glass
 * on iOS 26 with Apple's own selection morph), on Android Material's bottom navigation. Loading
 * the library safely lives in `screensModule.ts`; the navigator is `src/screens/TabsNavigator.tsx`.
 */
import type { AndroidSymbol } from 'expo-symbols';
import type { SFSymbolName } from '@/lib/sfSymbols';
import { FONTS } from '@/constants/fonts';

export type TabKey = 'camera' | 'feed' | 'messages' | 'profile';

/** Camera stays the app's landing page even though Profile leads the navigation order. */
export const INITIAL_TAB: TabKey = 'camera';

/**
 * The four tabs in the swipe order, Profile first and Messages last (owner, 2026-10-06).
 * iPhone: Apple's icons, plain, then filled when selected. Android: Google's Material icons
 * (Android marks the selected tab with its own pill).
 */
export const NATIVE_TABS: readonly {
  key: TabKey;
  title: string;
  icon: SFSymbolName;
  selectedIcon: SFSymbolName;
  androidIcon: AndroidSymbol;
}[] = [
  {
    key: 'profile',
    title: 'Profile',
    icon: 'person',
    selectedIcon: 'person.fill',
    androidIcon: 'person',
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
    key: 'camera',
    title: 'Camera',
    icon: 'camera',
    selectedIcon: 'camera.fill',
    androidIcon: 'photo_camera',
  },
  {
    key: 'messages',
    title: 'Messages',
    icon: 'bubble.left',
    selectedIcon: 'bubble.left.fill',
    androidIcon: 'chat_bubble',
  },
];

/** The tab titles in Inter, like every other word in the app (owner, 2026-10-05). */
const TAB_TITLE = { tabBarItemTitleFontFamily: FONTS.semiBold };
const TAB_TITLE_STATES = { normal: TAB_TITLE, selected: TAB_TITLE };

/** The bar's `standardAppearance` on each platform: only the title face; the rest stays the phone's. */
export const TAB_TITLE_APPEARANCE = {
  ios: { stacked: TAB_TITLE_STATES, inline: TAB_TITLE_STATES, compactInline: TAB_TITLE_STATES },
  android: TAB_TITLE,
};

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
 * The swipe pages, left to right, in the tab bar's order (owner, 2026-10-06): Profile ⇄ Feed ⇄
 * Camera ⇄ Messages, sideways only — no up/down swiping.
 */
export const SWIPE_PAGES: readonly TabKey[] = NATIVE_TABS.map((t) => t.key);

/** The tab for the swipe page showing. */
export function pageTab(index: number): TabKey {
  return SWIPE_PAGES[index] ?? INITIAL_TAB;
}

/** The swipe page a tab shows. */
export function tabPage(tab: TabKey): number {
  return Math.max(0, SWIPE_PAGES.indexOf(tab));
}

/**
 * Whether a tab selection the bar reports should move the pages: a tap does; a change the app
 * asked for (the bar catching up with a swipe) does not, or the pages would move twice.
 */
export function movesPages(actionOrigin: string): boolean {
  return actionOrigin !== 'programmatic-js';
}
