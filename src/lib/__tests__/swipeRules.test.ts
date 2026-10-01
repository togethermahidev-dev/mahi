import {
  atListTop,
  horizontalRelease,
  horizontalSwipe,
  rubberBand,
  verticalRelease,
  verticalSwipe,
} from '../swipeRules';

describe('swipe rules', () => {
  const screen = { width: 400, height: 800, insets: { top: 50, bottom: 34 } };
  const middle = { startX: 200, startY: 400 };

  describe('horizontalSwipe (Profile ↔ Home ↔ Messages)', () => {
    const h = (o: Partial<Parameters<typeof horizontalSwipe>[0]>) =>
      horizontalSwipe({ ...screen, ...middle, dx: 0, dy: 0, blocked: false, ...o });

    it('takes a clear sideways swipe', () => {
      expect(h({ dx: 30, dy: 5 })).toBe('activate');
    });
    it('waits until the finger has moved far enough', () => {
      expect(h({ dx: 10, dy: 2 })).toBe('wait');
    });
    it('lets an up/down swipe go', () => {
      expect(h({ dx: 5, dy: 30 })).toBe('fail');
    });
    it('leaves the side edges to the phone (Android back)', () => {
      expect(h({ startX: 10, dx: 40 })).toBe('fail');
      expect(h({ startX: 395, dx: -40 })).toBe('fail');
    });
    it('leaves the status bar and home bar strips to the phone', () => {
      expect(h({ startY: 20, dx: 40 })).toBe('fail');
      expect(h({ startY: 790, dx: 40 })).toBe('fail');
    });
    it('does nothing while a pop-up screen is open', () => {
      expect(h({ dx: 40, blocked: true })).toBe('fail');
    });
  });

  describe('verticalSwipe (Camera ↕ Feed)', () => {
    const v = (o: Partial<Parameters<typeof verticalSwipe>[0]>) =>
      verticalSwipe({
        ...screen,
        ...middle,
        dx: 0,
        dy: 0,
        blocked: false,
        onFeed: false,
        feedAtTop: true,
        listMoved: false,
        ...o,
      });

    it('takes an up or down swipe on Camera', () => {
      expect(v({ dy: -30 })).toBe('activate');
      expect(v({ dy: 30 })).toBe('activate');
    });
    it('lets a sideways swipe go', () => {
      expect(v({ dx: 30, dy: 5 })).toBe('fail');
    });
    it('on Feed, only a pull down from the top of the list goes back to Camera', () => {
      expect(v({ onFeed: true, dy: 30 })).toBe('activate');
      expect(v({ onFeed: true, feedAtTop: false, dy: 30 })).toBe('fail');
      expect(v({ onFeed: true, dy: -30 })).toBe('fail');
    });
    it('on Feed, once the list has scrolled under the finger, the drag stays with the list', () => {
      expect(v({ onFeed: true, dy: 30, listMoved: true })).toBe('fail');
      expect(v({ onFeed: true, dy: 15, listMoved: true })).toBe('fail');
    });
    it('leaves the status bar and home bar strips to the phone', () => {
      expect(v({ startY: 20, dy: 40 })).toBe('fail');
      expect(v({ startY: 790, dy: -40 })).toBe('fail');
    });
    it('does nothing while a pop-up screen is open', () => {
      expect(v({ dy: 40, blocked: true })).toBe('fail');
    });
  });

  describe('atListTop (the Feed list is at its top)', () => {
    it('counts the first 2px and any pull past the top', () => {
      expect(atListTop(0)).toBe(true);
      expect(atListTop(2)).toBe(true);
      expect(atListTop(-40)).toBe(true);
    });
    it('is false once the list has scrolled further', () => {
      expect(atListTop(2.5)).toBe(false);
      expect(atListTop(800)).toBe(false);
    });
  });

  describe('rubberBand (drag past the first or last page)', () => {
    it('follows the finger between the ends', () => {
      expect(rubberBand(-150, -800, 0)).toBe(-150);
    });
    it('moves a third as far past either end', () => {
      expect(rubberBand(90, -800, 0)).toBe(30);
      expect(rubberBand(-830, -800, 0)).toBe(-810);
    });
  });

  // Distances in px from where the finger went down; velocities in px per ms.
  describe('horizontalRelease (which page a sideways swipe lands on)', () => {
    it('goes one page left after a long enough drag right, or a quick flick right', () => {
      expect(horizontalRelease(1, 3, 61, 0)).toBe(0);
      expect(horizontalRelease(1, 3, 10, 0.5)).toBe(0);
    });
    it('goes one page right after a long enough drag left, or a quick flick left', () => {
      expect(horizontalRelease(1, 3, -61, 0)).toBe(2);
      expect(horizontalRelease(1, 3, -10, -0.5)).toBe(2);
    });
    it('snaps back after a short slow drag', () => {
      expect(horizontalRelease(1, 3, 60, 0.4)).toBe(1);
      expect(horizontalRelease(1, 3, -60, -0.4)).toBe(1);
    });
    it('stays put at either end', () => {
      expect(horizontalRelease(0, 3, 200, 2)).toBe(0);
      expect(horizontalRelease(2, 3, -200, -2)).toBe(2);
    });
    it('a flick back against the drag wins towards the right-hand page', () => {
      expect(horizontalRelease(1, 3, 80, -0.5)).toBe(2);
    });
  });

  describe('verticalRelease (Camera ↕ Feed, and the pull down for search)', () => {
    it('goes down to Feed after a long enough drag up, or a quick flick up', () => {
      expect(verticalRelease(0, 2, -61, 0)).toEqual({ index: 1, openSearch: false });
      expect(verticalRelease(0, 2, -10, -0.5)).toEqual({ index: 1, openSearch: false });
    });
    it('goes back up to Camera after a long enough pull down on Feed, or a quick flick', () => {
      expect(verticalRelease(1, 2, 61, 0)).toEqual({ index: 0, openSearch: false });
      expect(verticalRelease(1, 2, 10, 0.5)).toEqual({ index: 0, openSearch: false });
    });
    it('snaps back after a short slow drag', () => {
      expect(verticalRelease(0, 2, -60, -0.4)).toEqual({ index: 0, openSearch: false });
      expect(verticalRelease(1, 2, 60, 0.4)).toEqual({ index: 1, openSearch: false });
    });
    it('opens search on a pull down from Camera past 80px or faster than 0.3', () => {
      expect(verticalRelease(0, 2, 81, 0)).toEqual({ index: 0, openSearch: true });
      expect(verticalRelease(0, 2, 10, 0.31)).toEqual({ index: 0, openSearch: true });
      expect(verticalRelease(0, 2, 80, 0.3)).toEqual({ index: 0, openSearch: false });
    });
    it('a flick back against the drag wins towards the upper page', () => {
      expect(verticalRelease(1, 3, -80, 0.5)).toEqual({ index: 0, openSearch: false });
    });
    it('on Camera a flick down opens search even after a drag up', () => {
      expect(verticalRelease(0, 2, -80, 0.5)).toEqual({ index: 0, openSearch: true });
    });
  });

  // The navigators run these on the UI thread inside gesture callbacks.
  it('every rule is marked to run on the UI thread', () => {
    for (const fn of [
      horizontalSwipe,
      verticalSwipe,
      atListTop,
      rubberBand,
      horizontalRelease,
      verticalRelease,
    ]) {
      expect(fn.toString()).toContain("'worklet'");
    }
  });
});
