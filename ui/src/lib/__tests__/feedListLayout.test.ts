/**
 * The feed's two layouts (owner, 2026-10-09): full-screen posts, one per screen (switch
 * `feed-rows` off, the default), or rows (on). Pure geometry, unit-tested; the screen is
 * src/screens/FeedScreen.tsx.
 */
import {
  feedListLayout,
  fullScreenPaging,
  nearestSnap,
  pixelSnap,
  showsEndNote,
  snapBack,
} from '@/lib/feedListLayout';

const base = { pageHeight: 800, headerH: 100, topInset: 8, topSpace: 40, hasPosts: true };

describe('feedListLayout — full-screen posts (switch off, the default)', () => {
  const full = feedListLayout({ ...base, rows: false });

  it('makes each post one page tall and snaps one post per page', () => {
    expect(full.cardHeight).toBe(800);
    expect(full.snapInterval).toBe(800);
  });

  it('starts the first post at the top: the header and banners float over it', () => {
    expect(full.paddingTop).toBe(0);
    // Room kept on the first post for what floats over it (its small photo stays clear).
    expect(full.firstTopSpace).toBe(8 + 40);
  });

  it('every snap lands on a whole post: post n starts at n pages', () => {
    for (const n of [0, 1, 2, 7]) {
      expect(full.paddingTop + n * full.cardHeight!).toBe(n * full.snapInterval!);
    }
  });

  it('never snaps before the page has a size', () => {
    expect(feedListLayout({ ...base, rows: false, pageHeight: 0 }).snapInterval).toBeUndefined();
  });

  // Owner, 2026-10-10: "no white bar or edges between the scrolls". A page height that isn't a
  // whole number of screen pixels is drawn rounded to one; if the list then snapped by the
  // unrounded height, each post down the feed would sit a little further off, showing an edge.
  describe('one exact height for the post and the snap', () => {
    it('rounds the page to whole screen pixels', () => {
      // 700.2pt on a 3x screen is 2100.6 pixels: drawn as 2101.
      expect(pixelSnap(700.2, 3)).toBeCloseTo(2101 / 3, 10);
      expect(pixelSnap(700.4, 2)).toBe(700.5);
      expect(pixelSnap(700, 3)).toBe(700);
    });

    it('treats a missing pixel ratio as one pixel per point', () => {
      expect(pixelSnap(700.4, 0)).toBe(700);
    });

    it.each([
      [768.6666666666666, 3],
      [700.2, 3],
      [640.3, 2],
      [811.49, 3.5],
      [852, 3],
    ])('a %f pt page at %fx: the post and the snap are the same whole-pixel number', (h, ratio) => {
      const l = feedListLayout({ ...base, rows: false, pageHeight: h, pixelRatio: ratio });
      expect(l.snapInterval).toBe(l.cardHeight);
      expect(Math.abs(l.cardHeight! * ratio - Math.round(l.cardHeight! * ratio))).toBeLessThan(
        1e-6
      );
      // Thirty posts down, the thirtieth still starts exactly on a snap.
      expect(30 * l.cardHeight!).toBe(30 * l.snapInterval!);
    });

    it('rows are untouched by the pixel ratio', () => {
      expect(feedListLayout({ ...base, rows: true, pixelRatio: 3 })).toEqual(
        feedListLayout({ ...base, rows: true })
      );
    });
  });
});

describe('full-screen paging (the feed and the post viewer share it)', () => {
  it('one flick moves one post, snapping to its start', () => {
    expect(fullScreenPaging(800)).toEqual({
      snapToInterval: 800,
      snapToAlignment: 'start',
      disableIntervalMomentum: true,
      decelerationRate: 'fast',
    });
  });

  it('is off until the page has a size', () => {
    expect(fullScreenPaging(undefined)).toBeNull();
  });
});

describe('nearestSnap — where a paged list rests', () => {
  it('stays where it is on a whole post', () => {
    expect(nearestSnap(1600, 800)).toBe(1600);
    expect(nearestSnap(0, 800)).toBe(0);
  });

  it('goes back to the post it was nudged off (a two-finger pinch can drag the list a little)', () => {
    expect(nearestSnap(1618, 800)).toBe(1600);
    expect(nearestSnap(1590, 800)).toBe(1600);
  });

  it('goes on to the next post from past half way', () => {
    expect(nearestSnap(2001, 800)).toBe(2400);
  });

  it('never before the first post or past the last', () => {
    expect(nearestSnap(-40, 800)).toBe(0);
    expect(nearestSnap(5000, 800, 3)).toBe(1600);
    expect(nearestSnap(5000, 800, 0)).toBe(0);
  });

  it('leaves a list that doesn’t page alone', () => {
    expect(nearestSnap(123, undefined)).toBe(123);
  });
});

describe('snapBack — whether a list at rest needs moving', () => {
  it('says where to go when the list is off its post', () => {
    expect(snapBack(1618, 800)).toBe(1600);
    expect(snapBack(1599, 800)).toBe(1600);
    expect(snapBack(5000, 800, 3)).toBe(1600);
  });

  it('leaves a list on its post alone, give or take less than a screen pixel', () => {
    expect(snapBack(1600, 800)).toBeNull();
    // The phone reports where the list is in rounded numbers.
    expect(snapBack(1537.3333740234375, 768.6666666666666)).toBeNull();
  });

  it('leaves a list that doesn’t page alone', () => {
    expect(snapBack(123, undefined)).toBeNull();
  });
});

// The "loading more" spinner used to be a strip under the last post: the list could stop on it,
// half a post out of place, with a bar of background showing. Full screen, it floats over the
// last post instead and takes no room in the list.
describe('showsEndNote — loading more / couldn’t load more, over the last post', () => {
  const posts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('shows on the last post while more are loading or after a failed load', () => {
    expect(showsEndNote({ rows: false, posts, inViewId: 'c', busy: true, failed: false })).toBe(
      true
    );
    expect(showsEndNote({ rows: false, posts, inViewId: 'c', busy: false, failed: true })).toBe(
      true
    );
  });

  it('not on earlier posts, and not when there is nothing to say', () => {
    expect(showsEndNote({ rows: false, posts, inViewId: 'b', busy: true, failed: true })).toBe(
      false
    );
    expect(showsEndNote({ rows: false, posts, inViewId: 'c', busy: false, failed: false })).toBe(
      false
    );
    expect(showsEndNote({ rows: false, posts: [], inViewId: null, busy: true, failed: true })).toBe(
      false
    );
  });

  it('rows keep their own footer', () => {
    expect(showsEndNote({ rows: true, posts, inViewId: 'c', busy: true, failed: true })).toBe(
      false
    );
  });
});
