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
 * The four tabs in the rail's order. iPhone: Apple's icons, plain, then filled when selected.
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
    key: 'messages',
    title: 'Messages',
    icon: 'bubble.left',
    selectedIcon: 'bubble.left.fill',
    androidIcon: 'chat_bubble',
  },
  {
    key: 'profile',
    title: 'Profile',
    icon: 'person',
    selectedIcon: 'person.fill',
    androidIcon: 'person',
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
 * The swipe pages stay with the tab bar (owner, 2026-10-05): Profile ← Camera/Feed → Messages
 * sideways, Camera ↕ Feed up and down, exactly as on build 10. The bar shows which page is up
 * and a tap on it moves the pages. `hIndex`: 0 Profile, 1 Camera/Feed, 2 Messages; `vIndex`:
 * 0 Camera, 1 Feed.
 */
export function pageTab(hIndex: number, vIndex: number): TabKey {
  if (hIndex === 0) return 'profile';
  if (hIndex === 2) return 'messages';
  return vIndex === 0 ? 'camera' : 'feed';
}

/**
 * Whether a tab selection the bar reports should move the pages: a tap does; a change the app
 * asked for (the bar catching up with a swipe) does not, or the pages would move twice.
 */
export function movesPages(actionOrigin: string): boolean {
  return actionOrigin !== 'programmatic-js';
}
