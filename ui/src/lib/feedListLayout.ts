/**
 * The feed's two layouts (owner, 2026-10-09: "the TikTok style one as we previously had it"):
 * - full-screen posts, one per screen (switch `feed-rows` off, the default): each post is one page
 *   tall and the list snaps a whole post at a time. The camera slides all the way off the top when
 *   the feed is up (cameraFeed.ts), so the page is the feed's whole space; the see-through header,
 *   the notifications banner and the feed timer float over the first post, as before 2026-10-08.
 * - rows (switch on): the Messages-sized rows, starting under the header, the gap and the banners.
 * Pure geometry, unit-tested; the screen is src/screens/FeedScreen.tsx.
 */
export type FeedListLayout = {
  /** One post's height in full-screen mode; null for rows (they size themselves). */
  cardHeight: number | null;
  /** The list snaps this far, one post a flick; undefined = no paging (rows). */
  snapInterval: number | undefined;
  /** Room at the top of the list before the first item. */
  paddingTop: number;
  /** Room kept on the first full-screen post for what floats over it (beyond the header). */
  firstTopSpace: number;
};

export function feedListLayout({
  rows,
  pageHeight,
  headerH,
  topInset,
  topSpace,
  hasPosts,
}: {
  /** Switch `feed-rows` is on. */
  rows: boolean;
  /** The page's height (the screen, or the space above the tab bar). */
  pageHeight: number;
  /** The app header's height, which floats over the feed. */
  headerH: number;
  /** Extra room under the header (the gap the camera page leaves). */
  topInset: number;
  /** Room for the notifications banner and the feed timer. */
  topSpace: number;
  hasPosts: boolean;
}): FeedListLayout {
  if (rows) {
    return {
      cardHeight: null,
      snapInterval: undefined,
      paddingTop: hasPosts ? headerH + topInset + topSpace : 0,
      firstTopSpace: 0,
    };
  }
  return {
    cardHeight: pageHeight,
    snapInterval: pageHeight > 0 ? pageHeight : undefined,
    paddingTop: 0,
    firstTopSpace: topInset + topSpace,
  };
}
