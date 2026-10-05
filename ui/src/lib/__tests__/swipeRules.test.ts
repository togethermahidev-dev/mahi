import {
  atListTop,
  horizontalRelease,
  horizontalSwipe,
  rubberBand,
  backSwipeX,
  backSwipeCloses,
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
    // The glass bar sits on the left edge, inside the safe area (10px gap, 52px wide).
    const rail = { x: 10, y: 300, width: 52, height: 232 };
    it('leaves a touch that starts on the nav rail to the rail', () => {
      expect(h({ startX: 30, startY: 400, exclude: rail })).toBe('fail');
      expect(h({ startX: 62, startY: 532, dx: 40, exclude: rail })).toBe('fail');
    });
    it('still leaves the left edge strip to the phone, beside the rail too', () => {
      expect(h({ startX: 5, startY: 400, dx: 40, exclude: rail })).toBe('fail');
      expect(h({ startX: 20, startY: 200, dx: 40, exclude: rail })).toBe('fail');
    });
    it('still takes swipes that start beside the nav rail', () => {
      expect(h({ startX: 70, startY: 400, dx: 30, exclude: rail })).toBe('activate');
      expect(h({ startX: 30, startY: 290, dx: 30, exclude: rail })).toBe('activate');
      expect(h({ startX: 30, startY: 540, dx: 30, exclude: rail })).toBe('activate');
      expect(h({ startX: 30, startY: 400, dx: 30, exclude: null })).toBe('activate');
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

  // A profile opened over a page follows the finger right and closes like a page swipe
  // (founder, 2026-10-05: "the swipe needs to be clean like every other swipe on the app").
  describe('backSwipeX / backSwipeCloses (closing a profile opened over a page)', () => {
    it('follows the finger right, never past where it started', () => {
      expect(backSwipeX(0, 120)).toBe(120);
      expect(backSwipeX(0, -50)).toBe(0);
      expect(backSwipeX(30, 20)).toBe(50);
    });
    it('closes after the same drag or flick that turns a page', () => {
      expect(backSwipeCloses(61, 0)).toBe(true);
      expect(backSwipeCloses(10, 0.5)).toBe(true);
      expect(backSwipeCloses(60, 0.4)).toBe(false);
    });
    it('a flick back left keeps it open', () => {
      expect(backSwipeCloses(120, -0.5)).toBe(false);
    });
  });

  // The navigator runs these on the UI thread inside gesture callbacks.
  it('every rule is marked to run on the UI thread', () => {
    for (const fn of [
      horizontalSwipe,
      atListTop,
      rubberBand,
      horizontalRelease,
      backSwipeX,
      backSwipeCloses,
    ]) {
      expect(fn.toString()).toContain("'worklet'");
    }
  });
});
