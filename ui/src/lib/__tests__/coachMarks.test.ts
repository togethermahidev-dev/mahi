import {
  COACH_TIPS,
  COACH_TIP_ORDER,
  anchorOnScreen,
  coachBubblePlacement,
  coachSeenKey,
  nextCoachTip,
  parseSeenTips,
  serializeSeenTips,
  type CoachTipId,
} from '../coachMarks';

// Owner, 2026-10-07: "Make it clear to the users — they can't just be expected to know." One-time
// tips where people get lost, in the founder's words ("mates").
describe('coach tips — the words', () => {
  it('has the six tips, each on its own page', () => {
    expect(COACH_TIPS).toEqual({
      points: { text: 'Your Mahi points. Answer a mate’s tag to earn one.', page: 'camera' },
      bell: { text: 'A mate tagged you. Tap to answer.', page: 'feed' },
      twoPhotos: { text: 'Two photos: what you see, then a selfie.', page: 'camera' },
      waiting: {
        text: 'You’ll post again when a mate tags you. Check back each day.',
        page: 'camera',
      },
      feedLocked: {
        text: 'Your feed opens when you post. Answer tags to keep it open.',
        page: 'feed',
      },
      tagMates: { text: 'Tag 3 mates. Each gets 48 hours to post back.', page: 'compose' },
    });
  });

  it('orders every tip once', () => {
    expect([...COACH_TIP_ORDER].sort()).toEqual(Object.keys(COACH_TIPS).sort());
  });

  it('stays short and calm: one or two sentences, no shouting, no streak', () => {
    for (const { text } of Object.values(COACH_TIPS)) {
      expect(text.length).toBeLessThanOrEqual(64);
      expect(text).not.toMatch(/!|streak/i);
      expect(text).toMatch(/^[A-Z]/);
    }
  });
});

describe('coach tips — seen once per account on this device', () => {
  it('keeps one key per account', () => {
    expect(coachSeenKey('user-a')).toBe('@mahi:coach_tips_seen:user-a');
    expect(coachSeenKey('user-a')).not.toBe(coachSeenKey('user-b'));
  });

  it('reads back what it saved', () => {
    expect(parseSeenTips(serializeSeenTips(['points', 'bell']))).toEqual(['points', 'bell']);
  });

  it('reads nothing saved, or anything broken, as none seen', () => {
    expect(parseSeenTips(null)).toEqual([]);
    expect(parseSeenTips('not json')).toEqual([]);
    expect(parseSeenTips('{"points":true}')).toEqual([]);
  });

  it('forgets tips that no longer exist', () => {
    expect(parseSeenTips('["points","gone",3]')).toEqual(['points']);
  });
});

describe('nextCoachTip — never more than one, never over something else', () => {
  const base = {
    requested: ['points', 'twoPhotos'] as CoachTipId[],
    seen: [] as CoachTipId[],
    page: 'camera',
    blocked: false,
    current: null,
  };

  it('shows the first tip asked for on this page', () => {
    expect(nextCoachTip(base)).toBe('points');
  });

  it('skips a tip already seen', () => {
    expect(nextCoachTip({ ...base, seen: ['points'] })).toBe('twoPhotos');
    expect(nextCoachTip({ ...base, seen: ['points', 'twoPhotos'] })).toBeNull();
  });

  it('waits until the seen tips are read', () => {
    expect(nextCoachTip({ ...base, seen: null })).toBeNull();
  });

  it('waits while something is in the way (welcome cards, a sheet, a toast, a celebration)', () => {
    expect(nextCoachTip({ ...base, blocked: true })).toBeNull();
  });

  it('only shows tips for the page on screen', () => {
    expect(nextCoachTip({ ...base, page: 'feed' })).toBeNull();
    expect(nextCoachTip({ ...base, requested: ['feedLocked', 'points'], page: 'feed' })).toBe(
      'feedLocked'
    );
    expect(nextCoachTip({ ...base, requested: ['tagMates', 'points'], page: 'compose' })).toBe(
      'tagMates'
    );
  });

  it('never shows a tip nothing asked for', () => {
    expect(nextCoachTip({ ...base, requested: [] })).toBeNull();
  });

  it('keeps the tip on screen rather than swapping it for an earlier one', () => {
    expect(nextCoachTip({ ...base, current: 'twoPhotos' })).toBe('twoPhotos');
  });

  it('lets the current tip go once it is no longer asked for', () => {
    expect(nextCoachTip({ ...base, requested: ['points'], current: 'twoPhotos' })).toBe('points');
  });
});

describe('coachBubblePlacement — the bubble beside what it explains', () => {
  const container = { width: 390, height: 844 };
  const sizes = { maxWidth: 280, margin: 16, gap: 8, arrow: 10, radius: 12 };

  it('sits under something near the top, pointing up at it', () => {
    const p = coachBubblePlacement({
      anchor: { x: 280, y: 60, width: 90, height: 36 },
      container,
      ...sizes,
    });
    expect(p.above).toBe(false);
    expect(p.top).toBe(60 + 36 + 8);
    expect(p.bottom).toBeUndefined();
    expect(p.width).toBe(280);
    // Kept inside the screen's margin on the right.
    expect(p.left).toBe(390 - 16 - 280);
    // The arrow points at the middle of the anchor.
    expect(p.left + p.arrowLeft + 10 / 2).toBe(280 + 90 / 2);
  });

  it('sits above something near the bottom', () => {
    const p = coachBubblePlacement({
      anchor: { x: 160, y: 740, width: 70, height: 70 },
      container,
      ...sizes,
    });
    expect(p.above).toBe(true);
    expect(p.bottom).toBe(844 - 740 + 8);
    expect(p.top).toBeUndefined();
    expect(p.left).toBe(195 - 140);
  });

  it('keeps the arrow off the rounded corners', () => {
    const p = coachBubblePlacement({
      anchor: { x: 0, y: 60, width: 10, height: 10 },
      container,
      ...sizes,
    });
    expect(p.left).toBe(16);
    expect(p.arrowLeft).toBe(12);
  });

  it('narrows on a small screen', () => {
    const p = coachBubblePlacement({
      anchor: { x: 100, y: 100, width: 50, height: 50 },
      container: { width: 300, height: 600 },
      ...sizes,
    });
    expect(p.width).toBe(300 - 32);
    expect(p.left).toBe(16);
  });
});

describe('anchorOnScreen', () => {
  const container = { width: 390, height: 844 };

  it('is true when the middle of the anchor is inside the page', () => {
    expect(anchorOnScreen({ x: 10, y: 10, width: 40, height: 40 }, container)).toBe(true);
  });

  it('is false for an anchor on another page, slid away, or not laid out', () => {
    expect(anchorOnScreen({ x: 400, y: 10, width: 40, height: 40 }, container)).toBe(false);
    expect(anchorOnScreen({ x: 10, y: -60, width: 40, height: 40 }, container)).toBe(false);
    expect(anchorOnScreen({ x: 10, y: 10, width: 0, height: 0 }, container)).toBe(false);
  });
});
