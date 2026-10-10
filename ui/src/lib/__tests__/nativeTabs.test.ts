import {
  INITIAL_TAB,
  NATIVE_TABS,
  tabIcons,
  cameraLift,
  movesPages,
  tabTap,
  nativeTabsAvailable,
  pageTab,
  SWIPE_PAGES,
  TAB_TITLE_APPEARANCE,
  tabPage,
  cameraBadge,
} from '@/lib/nativeTabs';
import { FONTS } from '@/constants/fonts';

describe('cameraBadge (a tag waiting shows on the Camera tab)', () => {
  it('counts the open tags on the Camera tab once they have been read', () => {
    expect(cameraBadge('camera', { count: 1, loaded: true })).toBe('1');
    expect(cameraBadge('camera', { count: 3, loaded: true })).toBe('3');
  });
  it('shows nothing with no tag, before the first read, or on another tab', () => {
    expect(cameraBadge('camera', { count: 0, loaded: true })).toBeUndefined();
    expect(cameraBadge('camera', { count: 2, loaded: false })).toBeUndefined();
    expect(cameraBadge('profile', { count: 2, loaded: true })).toBeUndefined();
  });
});

describe('NATIVE_TABS', () => {
  // Owner, 2026-10-07: Messages leads and Profile sits last (swapped from 2026-10-06).
  it('follows the swipe order: Messages, Feed, Camera, then Profile', () => {
    expect(NATIVE_TABS.map((t) => t.key)).toEqual(['messages', 'camera', 'profile']);
  });

  it('labels each tab in sentence case', () => {
    expect(NATIVE_TABS.map((t) => t.title)).toEqual(['Messages', 'Camera', 'Profile']);
  });

  it('gives every tab an Apple icon for both states and a Material icon for Android', () => {
    for (const t of NATIVE_TABS) {
      expect(t.icon).toBeTruthy();
      expect(t.selectedIcon).toBeTruthy();
      expect(t.androidIcon).toBeTruthy();
    }
  });
});

describe('INITIAL_TAB', () => {
  it('keeps Camera as the landing page', () => {
    expect(INITIAL_TAB).toBe('camera');
  });
});

describe('tab titles', () => {
  // Owner, 2026-10-05: Inter everywhere, the phone's own tab bar included.
  it('sets Inter on iPhone for every layout and state', () => {
    for (const layout of ['stacked', 'inline', 'compactInline'] as const) {
      for (const state of ['normal', 'selected'] as const) {
        expect(TAB_TITLE_APPEARANCE.ios[layout][state].tabBarItemTitleFontFamily).toBe(
          FONTS.semiBold
        );
      }
    }
  });

  it('sets Inter on Android', () => {
    expect(TAB_TITLE_APPEARANCE.android.tabBarItemTitleFontFamily).toBe(FONTS.semiBold);
  });
});

describe('nativeTabsAvailable', () => {
  // No PostHog switch (owner, 2026-10-03): the build decides. Build 11+ has the native tabs.
  it('is on wherever the build has the native tabs, on iPhone and Android', () => {
    expect(nativeTabsAvailable('ios', true)).toBe(true);
    expect(nativeTabsAvailable('android', true)).toBe(true);
  });

  // Build 10 gets OTA updates but has no native tabs: it keeps the swipe pages.
  it('is off on a build without the native tabs', () => {
    expect(nativeTabsAvailable('ios', false)).toBe(false);
  });

  it('is off on the web', () => {
    expect(nativeTabsAvailable('web', true)).toBe(false);
  });
});

describe('cameraLift', () => {
  it('leaves the controls where they are with no tab bar', () => {
    expect(cameraLift(0, 32, 16)).toBe(0);
  });

  it('lifts them to sit a gap above the bar', () => {
    // Bar room 90, wanted gap 16: controls sit at 106 instead of 32, so 74 higher.
    expect(cameraLift(90, 32, 16)).toBe(74);
  });

  it('never moves them down', () => {
    expect(cameraLift(10, 32, 16)).toBe(0);
  });
});

// Owner, 2026-10-07: one row of swipe pages in the tab bar's order, Messages ⇄ Feed ⇄ Camera ⇄
// Profile; no up/down swiping. The app still opens on Camera.
describe('SWIPE_PAGES', () => {
  it('is Messages, Feed, Camera, Profile, left to right', () => {
    expect(SWIPE_PAGES).toEqual(['messages', 'camera', 'profile']);
  });

  it('is the tab bar order', () => {
    expect(SWIPE_PAGES).toEqual(NATIVE_TABS.map((t) => t.key));
  });
});

describe('pageTab', () => {
  it('names the tab for the page showing', () => {
    expect(pageTab(0)).toBe('messages');
    expect(pageTab(1)).toBe('camera');
    expect(pageTab(2)).toBe('profile');
  });
});

describe('tabPage', () => {
  it('finds the swipe page for every tab, Messages included', () => {
    expect(tabPage('messages')).toBe(0);
    expect(tabPage('camera')).toBe(1);
    expect(tabPage('profile')).toBe(2);
  });
});

describe('movesPages', () => {
  it('a tap on the bar moves the pages', () => {
    expect(movesPages('user')).toBe(true);
  });

  // A swipe already moved them; the bar is only catching up.
  it('a change the app asked for does not move them again', () => {
    expect(movesPages('programmatic-js')).toBe(false);
  });
});

// Owner, 2026-10-08: the feed lives behind the camera (one combined screen), so there is no Feed
// tab to padlock; the Camera tab keeps its own icons whatever the feed's state.
describe('tabIcons — no tab changes with the feed lock', () => {
  const camera = NATIVE_TABS.find((t) => t.key === 'camera')!;
  it('the Camera tab keeps its icons while the feed is locked', () => {
    expect(tabIcons(camera, true)).toEqual({ icon: 'camera', selectedIcon: 'camera.fill' });
    expect(tabIcons(camera, false)).toEqual({ icon: 'camera', selectedIcon: 'camera.fill' });
  });
});

// Owner, 2026-10-10: "If you're scrolling in your feed, to be able to press the camera then it
// takes you back to the top where the camera is."
describe('tabTap (what tapping a tab does)', () => {
  it('a tab you are not on moves the pages to it', () => {
    expect(tabTap({ tapped: 'messages', showing: 'camera' })).toBe('move');
    expect(tabTap({ tapped: 'camera', showing: 'profile' })).toBe('move');
  });
  it('Camera again, while on the camera page, brings the camera back from the feed', () => {
    expect(tabTap({ tapped: 'camera', showing: 'camera' })).toBe('home');
  });
  it('any other tab again does nothing', () => {
    expect(tabTap({ tapped: 'messages', showing: 'messages' })).toBe('none');
    expect(tabTap({ tapped: 'profile', showing: 'profile' })).toBe('none');
  });
});
