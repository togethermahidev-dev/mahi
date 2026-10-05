import {
  NATIVE_TABS,
  cameraLift,
  movesPages,
  nativeTabsAvailable,
  pageTab,
} from '@/lib/nativeTabs';

describe('NATIVE_TABS', () => {
  it('keeps the rail order: Camera, Feed, Messages, Profile', () => {
    expect(NATIVE_TABS.map((t) => t.key)).toEqual(['camera', 'feed', 'messages', 'profile']);
  });

  it('labels each tab in sentence case', () => {
    expect(NATIVE_TABS.map((t) => t.title)).toEqual(['Camera', 'Feed', 'Messages', 'Profile']);
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

// The swipe pages stay with the tab bar (owner, 2026-10-05: "the swiping left right up down
// mechanic still needs to work and be the same"). The bar only shows and picks the page.
describe('pageTab', () => {
  it('names the tab for where the swipe pages are', () => {
    expect(pageTab(0, 0)).toBe('profile');
    expect(pageTab(1, 0)).toBe('camera');
    expect(pageTab(1, 1)).toBe('feed');
    expect(pageTab(2, 0)).toBe('messages');
  });

  it('Profile and Messages win whatever the up/down page is', () => {
    expect(pageTab(0, 1)).toBe('profile');
    expect(pageTab(2, 1)).toBe('messages');
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
