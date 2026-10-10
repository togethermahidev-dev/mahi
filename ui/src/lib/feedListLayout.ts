/**
 * The feed's two layouts (owner, 2026-10-09: "the TikTok style one as we previously had it"):
 * - full-screen posts, one per screen (switch `feed-rows` off, the default): each post is one page
 *   tall and the list snaps a whole post at a time. The camera slides all the way off the top when
 *   the feed is up (cameraFeed.ts), so the page is the feed's whole space; the see-through header,
 *   the notifications banner and the feed timer float over the first post, as before 2026-10-08.
 * - rows (switch on): the Messages-sized rows, starting under the header, the gap and the banners.
 *
 * Full screen, nothing shows between posts (owner, 2026-10-10: "no white bar or edges between the
 * scrolls"): a post's height and the snap are one whole-pixel number (`pixelSnap`), the list has
 * no footer strip to stop on (`showsEndNote` floats it over the last post) and a list nudged off
 * its post goes back (`snapBack`). The post viewer pages the same way (`fullScreenPaging`).
 * Pure geometry, unit-tested; the screens are src/screens/FeedScreen.tsx and
 * src/components/PostViewer.tsx.
 */
import { POST_FULL } from '@/constants/tokens';

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

/**
 * A length rounded to whole screen pixels (`pixelRatio` pixels per point), as the phone draws it.
 * The same sum as React Native's PixelRatio.roundToNearestPixel, kept here so it can be tested.
 */
export function pixelSnap(value: number, pixelRatio: number): number {
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  return Math.round(value * ratio) / ratio;
}

export function feedListLayout({
  rows,
  pageHeight,
  headerH,
  topInset,
  topSpace,
  hasPosts,
  pixelRatio = 1,
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
  /** Screen pixels per point (PixelRatio.get()). */
  pixelRatio?: number;
}): FeedListLayout {
  if (rows) {
    return {
      cardHeight: null,
      snapInterval: undefined,
      paddingTop: hasPosts ? headerH + topInset + topSpace : 0,
      firstTopSpace: 0,
    };
  }
  // One number for both: a post drawn a fraction of a pixel off the snap would show its
  // neighbour's edge, a little more with every post down the feed.
  const cardHeight = pixelSnap(pageHeight, pixelRatio);
  return {
    cardHeight,
    snapInterval: cardHeight > 0 ? cardHeight : undefined,
    paddingTop: 0,
    firstTopSpace: topInset + topSpace,
  };
}

/**
 * The list settings for full-screen posts: one flick moves one post, however hard, as on TikTok
 * and Reels. Null until the page has a size. Shared by the feed and the post viewer.
 */
export function fullScreenPaging(snapInterval: number | undefined): {
  snapToInterval: number;
  snapToAlignment: 'start';
  disableIntervalMomentum: true;
  decelerationRate: 'fast';
} | null {
  if (!snapInterval) return null;
  return {
    snapToInterval: snapInterval,
    snapToAlignment: 'start',
    disableIntervalMomentum: true,
    decelerationRate: 'fast',
  };
}

/**
 * Where a paged list should rest from `offset`: the start of the nearest post, never before the
 * first or (given `count`) past the last. A list that doesn't page stays where it is.
 */
export function nearestSnap(
  offset: number,
  snapInterval: number | undefined,
  count?: number
): number {
  if (!snapInterval) return offset;
  const last = count == null ? Infinity : Math.max(0, count - 1);
  const index = Math.min(last, Math.max(0, Math.round(offset / snapInterval)));
  return index * snapInterval;
}

/**
 * Where a paged list that has come to rest off its post should go, or null when it is on one
 * already (give or take less than a screen pixel: the phone reports offsets in rounded numbers).
 */
export function snapBack(
  offset: number,
  snapInterval: number | undefined,
  count?: number
): number | null {
  const rest = nearestSnap(offset, snapInterval, count);
  return Math.abs(rest - offset) < POST_FULL.snapSlack ? null : rest;
}

/**
 * Whether "loading more" / "couldn't load more" floats over the post on screen: full-screen posts
 * only, on the last post, when there is something to say. (Rows keep their footer.)
 */
export function showsEndNote({
  rows,
  posts,
  inViewId,
  busy,
  failed,
}: {
  rows: boolean;
  posts: { id: string }[];
  /** The post on screen. */
  inViewId: string | null;
  /** More posts are loading. */
  busy: boolean;
  /** The last load failed. */
  failed: boolean;
}): boolean {
  if (rows || posts.length === 0 || !(busy || failed)) return false;
  return posts[posts.length - 1].id === inViewId;
}
