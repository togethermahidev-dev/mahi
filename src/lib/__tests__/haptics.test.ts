// expo-haptics is a native module: the node test harness gets a stand-in with the same enums.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Soft: 'soft',
    Rigid: 'rigid',
  },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import * as Haptics from 'expo-haptics';
import {
  HAPTIC_MOMENTS,
  feedLockMoment,
  haptic,
  postedMoments,
  type HapticMoment,
} from '../haptics';

const impact = Haptics.impactAsync as jest.Mock;
const notification = Haptics.notificationAsync as jest.Mock;
const selection = Haptics.selectionAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('haptic moments — one named feel per moment in the app', () => {
  it('names every moment the brief asked for', () => {
    const asked: HapticMoment[] = [
      'shutter',
      'flip',
      'tagSent',
      'postSent',
      'streakUp',
      'feedUnlocked',
      'feedLocked',
      'error',
      'selection',
    ];
    for (const m of asked) expect(HAPTIC_MOMENTS).toHaveProperty(m);
  });

  it('the shutter is a crisp rigid click', () => {
    haptic('shutter');
    expect(impact).toHaveBeenCalledWith('rigid');
  });

  it('flipping the camera is a soft bump', () => {
    haptic('flip');
    expect(impact).toHaveBeenCalledWith('soft');
  });

  it('picking from a list or a switch is the system selection tick', () => {
    haptic('selection');
    expect(selection).toHaveBeenCalledTimes(1);
    expect(impact).not.toHaveBeenCalled();
  });

  it('tags reaching friends and the feed opening feel like a success', () => {
    haptic('tagSent');
    haptic('feedUnlocked');
    expect(notification).toHaveBeenNthCalledWith(1, 'success');
    expect(notification).toHaveBeenNthCalledWith(2, 'success');
  });

  it('a streak going up is the heaviest bump', () => {
    haptic('streakUp');
    expect(impact).toHaveBeenCalledWith('heavy');
  });

  it('the feed locking and a refused action warn; a failure is an error', () => {
    haptic('feedLocked');
    haptic('warning');
    haptic('error');
    expect(notification.mock.calls).toEqual([['warning'], ['warning'], ['error']]);
  });

  it('keeps the light tick for page changes and the lift for dragging', () => {
    haptic('tick');
    haptic('pickUp');
    expect(impact.mock.calls).toEqual([['light'], ['light']]);
  });

  it('never throws when the phone has no haptics', async () => {
    impact.mockReturnValueOnce(Promise.reject(new Error('no haptics engine')));
    expect(() => haptic('shutter')).not.toThrow();
    await Promise.resolve();
  });
});

describe('postedMoments — what a confirmed post feels like', () => {
  it('tags sent, then the streak going up', () => {
    expect(postedMoments({ tags: 3, streakBefore: 4, streakAfter: 5 })).toEqual([
      'tagSent',
      'streakUp',
    ]);
  });

  it('tags sent without a streak change (a first post answers no tag)', () => {
    expect(postedMoments({ tags: 3, streakBefore: 0, streakAfter: 0 })).toEqual(['tagSent']);
  });

  it('invite links count as tags', () => {
    expect(postedMoments({ tags: 1, streakBefore: 2, streakAfter: 2 })).toEqual(['tagSent']);
  });

  it('nothing extra when no one was tagged and the streak stayed', () => {
    expect(postedMoments({ tags: 0, streakBefore: 2, streakAfter: 2 })).toEqual([]);
  });

  it('a streak that went down (a missed tag) is not a celebration', () => {
    expect(postedMoments({ tags: 3, streakBefore: 5, streakAfter: 1 })).toEqual(['tagSent']);
  });
});

describe('feedLockMoment — felt once, when the feed you are looking at locks or opens', () => {
  it('feels nothing until the feed has loaded, and forgets what it saw', () => {
    expect(feedLockMoment({ seen: true, locked: false, loaded: false, onScreen: true })).toEqual({
      moment: null,
      seen: null,
    });
  });

  it('the first read of a session only sets what was seen', () => {
    expect(feedLockMoment({ seen: null, locked: true, loaded: true, onScreen: true })).toEqual({
      moment: null,
      seen: true,
    });
  });

  it('feels the feed opening while you look at it', () => {
    expect(feedLockMoment({ seen: true, locked: false, loaded: true, onScreen: true })).toEqual({
      moment: 'feedUnlocked',
      seen: false,
    });
  });

  it('feels the feed locking while you look at it', () => {
    expect(feedLockMoment({ seen: false, locked: true, loaded: true, onScreen: true })).toEqual({
      moment: 'feedLocked',
      seen: true,
    });
  });

  it('a change while you are on another screen waits until you come to the feed', () => {
    const away = feedLockMoment({ seen: true, locked: false, loaded: true, onScreen: false });
    expect(away).toEqual({ moment: null, seen: true });
    expect(
      feedLockMoment({ seen: away.seen, locked: false, loaded: true, onScreen: true })
    ).toEqual({ moment: 'feedUnlocked', seen: false });
  });

  it('no change, no feel', () => {
    expect(feedLockMoment({ seen: false, locked: false, loaded: true, onScreen: true })).toEqual({
      moment: null,
      seen: false,
    });
  });
});
