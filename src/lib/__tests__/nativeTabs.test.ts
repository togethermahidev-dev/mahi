import {
  NATIVE_TABS,
  cameraLift,
  movesPages,
  nativeTabsAvailable,
  pageTab,
  SWIPE_PAGES,
  tabPage,
} from '@/lib/nativeTabs';

describe('NATIVE_TABS', () => {
  // Founder, 2026-10-05: the bar reads in the swipe order, Messages last.
  it('follows the swipe order: Camera, Feed, Profile, then Messages', () => {
    expect(NATIVE_TABS.map((t) => t.key)).toEqual(['camera', 'feed', 'profile', 'messages']);
  });

  it('labels each tab in sentence case', () => {
    expect(NATIVE_TABS.map((t) => t.title)).toEqual(['Camera', 'Feed', 'Profile', 'Messages']);
  });

  it('gives every tab an Apple icon for both states and a Material icon for Android', () => {
    for (const t of NATIVE_TABS) {
      expect(t.icon).toBeTruthy();
      expect(t.selectedIcon).toBeTruthy();
      expect(t.androidIcon).toBeTruthy();
    }
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

// Founder, 2026-10-05: one row of swipe pages, Camera ⇄ Feed ⇄ Profile; no up/down swiping;
// Messages only by its tab or the header button.
describe('SWIPE_PAGES', () => {
  it('is Camera, Feed, Profile, left to right', () => {
    expect(SWIPE_PAGES).toEqual(['camera', 'feed', 'profile']);
  });
});

describe('pageTab', () => {
  it('names the tab for the page showing', () => {
    expect(pageTab(0, false)).toBe('camera');
    expect(pageTab(1, false)).toBe('feed');
    expect(pageTab(2, false)).toBe('profile');
  });

  it('is Messages while Messages is open, whatever page is under it', () => {
    expect(pageTab(1, true)).toBe('messages');
  });
});

describe('tabPage', () => {
  it('finds the swipe page for a tab', () => {
    expect(tabPage('camera')).toBe(0);
    expect(tabPage('feed')).toBe(1);
    expect(tabPage('profile')).toBe(2);
  });

  it('Messages has no swipe page', () => {
    expect(tabPage('messages')).toBeNull();
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
