import { horizontalSwipe, verticalSwipe } from '../swipeRules';

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
        ...screen, ...middle, dx: 0, dy: 0, blocked: false, onFeed: false, feedAtTop: true, ...o,
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
    it('leaves the status bar and home bar strips to the phone', () => {
      expect(v({ startY: 20, dy: 40 })).toBe('fail');
      expect(v({ startY: 790, dy: -40 })).toBe('fail');
    });
    it('does nothing while a pop-up screen is open', () => {
      expect(v({ dy: 40, blocked: true })).toBe('fail');
    });
  });
});
