import {
  COACH_TIPS,
  COACH_TIP_ORDER,
  anchorVisible,
  coachBubbleLayout,
  coachQueue,
  coachSeenKey,
  coachStepLabel,
  coachTipText,
  nextCoachTip,
  parseSeenTips,
  roundedRectPath,
  sameRect,
  serializeSeenTips,
  spotlightPath,
  spotlightRect,
  tipPresenter,
  type CoachTipId,
} from '../coachMarks';

// Owner, 2026-10-07: "Make it clear to the users — they can't just be expected to know." One-time
// tips where people get lost, in the founder's words ("mates"): a bold title and one line.
describe('coach tips — the words', () => {
  it('has the seven tips, each split into a title and one line', () => {
    const words = Object.fromEntries(
      Object.entries(COACH_TIPS).map(([id, t]) => [id, [t.title, t.body, t.page]])
    );
    expect(words).toEqual({
      points: ['Your Mahi points', 'Your first post and each answer earn 1.', 'camera'],
      bell: ['A friend tagged you', 'Tap to answer.', 'feed'],
      twoPhotos: ['Two photos', 'What you see, then a selfie.', 'camera'],
      waiting: ['You’ll post again when a friend tags you', 'Check back each day.', 'camera'],
      pullDown: ['Pull down to peek', 'The card shows who you’re waiting on.', 'camera'],
      feedLocked: ['Your feed opens when you post', 'Answer tags to keep it open.', 'feed'],
      tagMates: ['Tag 3 friends', 'Each gets 48 hours to post back.', 'compose'],
    });
  });

  it('reads as one sentence pair for VoiceOver', () => {
    expect(coachTipText('points')).toBe(
      'Your Mahi points. Your first post and each answer earn 1.'
    );
    expect(coachTipText('twoPhotos')).toBe('Two photos. What you see, then a selfie.');
  });

  it('orders every tip once', () => {
    expect([...COACH_TIP_ORDER].sort()).toEqual(Object.keys(COACH_TIPS).sort());
  });

  it('stays short and calm: no shouting, no streak, a title without a full stop', () => {
    for (const { title, body } of Object.values(COACH_TIPS)) {
      expect(title.length).toBeLessThanOrEqual(40);
      expect(body.length).toBeLessThanOrEqual(40);
      expect(`${title} ${body}`).not.toMatch(/!|streak/i);
      expect(title).not.toMatch(/\.$/);
      expect(body).toMatch(/^[A-Z].*\.$/);
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

describe('coachQueue and coachStepLabel — "1 of 3" when tips wait their turn', () => {
  it('lists the unseen tips asked for on this page, in order', () => {
    expect(
      coachQueue({
        requested: ['twoPhotos', 'bell', 'points', 'waiting'],
        seen: ['waiting'],
        page: 'camera',
      })
    ).toEqual(['points', 'twoPhotos']);
    expect(coachQueue({ requested: ['points'], seen: null, page: 'camera' })).toEqual([]);
  });

  it('counts the ones closed this visit', () => {
    expect(coachStepLabel(0, 3)).toBe('1 of 3');
    expect(coachStepLabel(1, 2)).toBe('2 of 3');
    expect(coachStepLabel(2, 1)).toBe('3 of 3');
  });

  it('says nothing for a tip on its own', () => {
    expect(coachStepLabel(0, 1)).toBeNull();
    expect(coachStepLabel(0, 0)).toBeNull();
  });
});

describe('tipPresenter — Apple’s popover where the build has it', () => {
  it('uses the native popover on an iPhone with @expo/ui', () => {
    expect(tipPresenter('ios', true)).toBe('native');
  });

  it('draws its own tip on build 10 and on Android', () => {
    expect(tipPresenter('ios', false)).toBe('custom');
    expect(tipPresenter('android', false)).toBe('custom');
    expect(tipPresenter('android', true)).toBe('custom');
  });
});

describe('anchorVisible — no tip until the thing it explains is really on screen', () => {
  const container = { width: 390, height: 844 };

  it('is true for a laid-out rect inside the page', () => {
    expect(anchorVisible({ x: 10, y: 10, width: 40, height: 40 }, container)).toBe(true);
    expect(anchorVisible({ x: 0, y: 0, width: 390, height: 844 }, container)).toBe(true);
  });

  it('is false when not laid out, on another page, or partly slid off', () => {
    expect(anchorVisible({ x: 10, y: 10, width: 0, height: 0 }, container)).toBe(false);
    expect(anchorVisible({ x: 400, y: 10, width: 40, height: 40 }, container)).toBe(false);
    expect(anchorVisible({ x: 10, y: -30, width: 40, height: 40 }, container)).toBe(false);
    expect(anchorVisible({ x: 370, y: 10, width: 40, height: 40 }, container)).toBe(false);
  });

  it('allows a hair of rounding at the edges', () => {
    expect(anchorVisible({ x: -0.5, y: 0, width: 390.5, height: 40 }, container)).toBe(true);
  });
});

describe('sameRect — measured twice, the same both times (settled)', () => {
  const a = { x: 10, y: 20, width: 30, height: 40 };
  it('ignores a hair of rounding', () => {
    expect(sameRect(a, { x: 10.4, y: 19.6, width: 30, height: 40 })).toBe(true);
  });
  it('sees a move or a resize', () => {
    expect(sameRect(a, { ...a, y: 30 })).toBe(false);
    expect(sameRect(a, { ...a, width: 60 })).toBe(false);
    expect(sameRect(a, null)).toBe(false);
  });
});

describe('spotlight — the target stays bright inside a rounded cut-out', () => {
  const container = { width: 390, height: 844 };

  it('pads the cut-out around the target', () => {
    expect(spotlightRect({ x: 100, y: 200, width: 50, height: 20 }, 6, container)).toEqual({
      x: 94,
      y: 194,
      width: 62,
      height: 32,
    });
  });

  it('keeps the cut-out inside the page', () => {
    expect(spotlightRect({ x: 2, y: 2, width: 50, height: 20 }, 6, container)).toEqual({
      x: 0,
      y: 0,
      width: 58,
      height: 28,
    });
  });

  it('draws a rounded rectangle', () => {
    expect(roundedRectPath({ x: 10, y: 20, width: 100, height: 40 }, 8)).toBe(
      'M18 20H102A8 8 0 0 1 110 28V52A8 8 0 0 1 102 60H18A8 8 0 0 1 10 52V28A8 8 0 0 1 18 20Z'
    );
  });

  it('never rounds past half the height (a pill keeps round ends)', () => {
    expect(roundedRectPath({ x: 0, y: 0, width: 100, height: 20 }, 16)).toBe(
      roundedRectPath({ x: 0, y: 0, width: 100, height: 20 }, 10)
    );
  });

  it('dims the whole page with the cut-out as a hole', () => {
    const spot = { x: 10, y: 20, width: 100, height: 40 };
    expect(spotlightPath(container, spot, 8)).toBe(`M0 0H390V844H0Z${roundedRectPath(spot, 8)}`);
  });
});

describe('coachBubbleLayout — beside the target, the arrow on its middle', () => {
  const container = { width: 390, height: 844 };
  const sizes = {
    maxWidth: 300,
    margin: 16,
    gap: 4,
    arrowWidth: 18,
    arrowHeight: 9,
    radius: 16,
    safeTop: 47,
    safeBottom: 34,
  };
  const middle = (spot: { x: number; width: number }) => spot.x + spot.width / 2;

  it('goes below when there is room, arrow up at the exact middle', () => {
    const spot = { x: 280, y: 90, width: 96, height: 44 };
    const p = coachBubbleLayout({ spot, container, bubbleHeight: 120, ...sizes });
    expect(p.above).toBe(false);
    expect(p.top).toBe(90 + 44 + 4 + 9);
    expect(p.width).toBe(300);
    expect(p.left).toBe(390 - 16 - 300);
    expect(p.left + p.arrowLeft + 18 / 2).toBe(middle(spot));
  });

  it('goes above when there is no room below', () => {
    const spot = { x: 150, y: 700, width: 90, height: 90 };
    const p = coachBubbleLayout({ spot, container, bubbleHeight: 120, ...sizes });
    expect(p.above).toBe(true);
    expect(p.top).toBe(700 - 4 - 9 - 120);
    expect(p.left).toBe(195 - 150);
    expect(p.left + p.arrowLeft + 18 / 2).toBe(middle(spot));
  });

  it('keeps the arrow off the rounded corners at the screen edge', () => {
    const spot = { x: 0, y: 90, width: 20, height: 20 };
    const p = coachBubbleLayout({ spot, container, bubbleHeight: 100, ...sizes });
    expect(p.left).toBe(16);
    expect(p.arrowLeft).toBe(16);
  });

  it('narrows on a small screen', () => {
    const p = coachBubbleLayout({
      spot: { x: 100, y: 100, width: 50, height: 50 },
      container: { width: 300, height: 600 },
      bubbleHeight: 100,
      ...sizes,
    });
    expect(p.width).toBe(300 - 32);
    expect(p.left).toBe(16);
  });

  it('with no room either side, takes the roomier side and stays on screen', () => {
    const spot = { x: 100, y: 300, width: 100, height: 300 };
    const p = coachBubbleLayout({
      spot,
      container: { width: 390, height: 700 },
      bubbleHeight: 260,
      ...sizes,
    });
    expect(p.above).toBe(true);
    expect(p.top).toBe(47 + 16);
  });
});
