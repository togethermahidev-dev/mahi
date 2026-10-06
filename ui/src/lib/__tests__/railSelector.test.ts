import {
  dockShows,
  followSpan,
  morphPlan,
  nearestSlot,
  railShows,
  slotSpan,
} from '../railSelector';

// The rail as drawn today: 4px padding, 44px buttons, 6px between them (3px above and below each).
const rail = { padding: 4, button: 44, gap: 6, count: 4 };

describe('rail selector', () => {
  describe('slotSpan (where each icon sits, from the rail top)', () => {
    it('places the icons one button plus one gap apart', () => {
      expect(slotSpan(rail, 0)).toEqual({ top: 7, bottom: 51 });
      expect(slotSpan(rail, 1)).toEqual({ top: 57, bottom: 101 });
      expect(slotSpan(rail, 3)).toEqual({ top: 157, bottom: 201 });
    });
  });

  describe('nearestSlot (which icon is nearest a finger)', () => {
    it('picks the icon under the finger', () => {
      expect(nearestSlot(rail, 29)).toBe(0);
      expect(nearestSlot(rail, 79)).toBe(1);
      expect(nearestSlot(rail, 140)).toBe(2);
    });
    it('switches at the midpoint between two icons', () => {
      expect(nearestSlot(rail, 53)).toBe(0);
      expect(nearestSlot(rail, 55)).toBe(1);
    });
    it('keeps to the first and last icon when the finger leaves the rail', () => {
      expect(nearestSlot(rail, -80)).toBe(0);
      expect(nearestSlot(rail, 600)).toBe(3);
    });
  });

  describe('followSpan (the selector under a dragging finger)', () => {
    it('centres the selector on the finger', () => {
      expect(followSpan(rail, 100)).toEqual({ top: 78, bottom: 122 });
    });
    it('stops at the first and last icon', () => {
      expect(followSpan(rail, 0)).toEqual(slotSpan(rail, 0));
      expect(followSpan(rail, 400)).toEqual(slotSpan(rail, 3));
    });
  });

  describe('morphPlan (stretch from the old spot to the new, then contract)', () => {
    const from = slotSpan(rail, 0);
    const to = slotSpan(rail, 2);

    it('first stretches to cover both icons, then settles on the new one', () => {
      expect(morphPlan(from, to, false)).toEqual({ stretch: { top: 7, bottom: 151 }, settle: to });
    });
    it('stretches upward when moving up', () => {
      expect(morphPlan(to, from, false)).toEqual({
        stretch: { top: 7, bottom: 151 },
        settle: from,
      });
    });
    it('stretches from wherever it is mid-move', () => {
      expect(morphPlan({ top: 30, bottom: 120 }, to, false).stretch).toEqual({
        top: 30,
        bottom: 151,
      });
    });
    it('with Reduce Motion on, just moves without stretching', () => {
      expect(morphPlan(from, to, true)).toEqual({ stretch: to, settle: to });
    });
  });

  describe('railShows (the rail is seen on the Camera only)', () => {
    const onCamera = { on: true, tab: 'camera', overlay: false, covered: false } as const;

    it('shows on the Camera', () => {
      expect(railShows(onCamera)).toBe(true);
    });
    it('is hidden on Feed, Messages and Profile', () => {
      expect(railShows({ ...onCamera, tab: 'feed' })).toBe(false);
      expect(railShows({ ...onCamera, tab: 'messages' })).toBe(false);
      expect(railShows({ ...onCamera, tab: 'profile' })).toBe(false);
    });
    it('is hidden under a pop-up or a full-screen view opened over the Camera', () => {
      expect(railShows({ ...onCamera, overlay: true })).toBe(false);
      expect(railShows({ ...onCamera, covered: true })).toBe(false);
    });
    it('is hidden everywhere when the switch is off', () => {
      expect(railShows({ ...onCamera, on: false })).toBe(false);
    });
  });

  describe('dockShows (the glass bar along the bottom of Feed, Profile and Messages)', () => {
    const onFeed = { on: true, tab: 'feed', overlay: false, covered: false } as const;

    it('shows on Feed, Profile and Messages, so each page has a tap to every other', () => {
      expect(dockShows(onFeed)).toBe(true);
      expect(dockShows({ ...onFeed, tab: 'profile' })).toBe(true);
      expect(dockShows({ ...onFeed, tab: 'messages' })).toBe(true);
    });
    it('is not on the Camera, which has the rail', () => {
      expect(dockShows({ ...onFeed, tab: 'camera' })).toBe(false);
    });
    it('is hidden under a pop-up or a full-screen view', () => {
      expect(dockShows({ ...onFeed, overlay: true })).toBe(false);
      expect(dockShows({ ...onFeed, covered: true })).toBe(false);
    });
    it('is hidden everywhere when the switch is off', () => {
      expect(dockShows({ ...onFeed, on: false })).toBe(false);
    });
  });
});
