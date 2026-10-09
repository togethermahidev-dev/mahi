/**
 * The feed's two layouts (owner, 2026-10-09): full-screen posts, one per screen (switch
 * `feed-rows` off, the default), or rows (on). Pure geometry, unit-tested; the screen is
 * src/screens/FeedScreen.tsx.
 */
import { feedListLayout } from '@/lib/feedListLayout';

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
});

describe('feedListLayout — rows (switch on)', () => {
  it('is today’s rows: no paging, the list starts under the header, the gap and the banners', () => {
    expect(feedListLayout({ ...base, rows: true })).toEqual({
      cardHeight: null,
      snapInterval: undefined,
      paddingTop: 100 + 8 + 40,
      firstTopSpace: 0,
    });
  });

  it('keeps no top room with nothing to show (the empty and error states place themselves)', () => {
    expect(feedListLayout({ ...base, rows: true, hasPosts: false }).paddingTop).toBe(0);
  });
});
