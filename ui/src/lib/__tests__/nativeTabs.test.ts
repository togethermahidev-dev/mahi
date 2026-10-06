import {
  INITIAL_TAB,
  NATIVE_TABS,
  cameraLift,
  movesPages,
  nativeTabsAvailable,
  pageTab,
  SWIPE_PAGES,
  TAB_TITLE_APPEARANCE,
  tabPage,
} from '@/lib/nativeTabs';
import { FONTS } from '@/constants/fonts';

describe('NATIVE_TABS', () => {
  // Owner, 2026-10-06: Profile leads, Camera sits between Feed and Messages.
  it('follows the swipe order: Profile, Feed, Camera, then Messages', () => {
    expect(NATIVE_TABS.map((t) => t.key)).toEqual(['profile', 'feed', 'camera', 'messages']);
  });

  it('labels each tab in sentence case', () => {
    expect(NATIVE_TABS.map((t) => t.title)).toEqual(['Profile', 'Feed', 'Camera', 'Messages']);
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

// Owner, 2026-10-06: one row of swipe pages in the tab bar's order, Profile ⇄ Feed ⇄ Camera ⇄
// Messages; no up/down swiping. The app still opens on Camera.
describe('SWIPE_PAGES', () => {
  it('is Profile, Feed, Camera, Messages, left to right', () => {
    expect(SWIPE_PAGES).toEqual(['profile', 'feed', 'camera', 'messages']);
  });

  it('is the tab bar order', () => {
    expect(SWIPE_PAGES).toEqual(NATIVE_TABS.map((t) => t.key));
  });
});

describe('pageTab', () => {
  it('names the tab for the page showing', () => {
    expect(pageTab(0)).toBe('profile');
    expect(pageTab(1)).toBe('feed');
    expect(pageTab(2)).toBe('camera');
    expect(pageTab(3)).toBe('messages');
  });
});

describe('tabPage', () => {
  it('finds the swipe page for every tab, Messages included', () => {
    expect(tabPage('profile')).toBe(0);
    expect(tabPage('feed')).toBe(1);
    expect(tabPage('camera')).toBe(2);
    expect(tabPage('messages')).toBe(3);
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
