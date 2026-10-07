/**
 * One-time tips (coach marks) where people get lost (owner, 2026-10-07: "they can't just be
 * expected to know"). Each tip points at one thing on one page, shows once per account on this
 * device, and goes on a tap anywhere or "Got it". Never more than one at a time, and never over
 * the welcome cards, a sheet, a toast, the point celebration or the notifications page.
 * Pure and SDK-free so the rules are unit-tested; the bubble is src/components/CoachMark.tsx.
 */

/** The page a tip belongs to: one of the swipe pages, or the post preview ('compose'). */
export type CoachPage = 'camera' | 'feed' | 'compose';

export interface CoachTip {
  text: string;
  page: CoachPage;
}

/** Every tip, in the founder's words ("mates"). */
export const COACH_TIPS = {
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
} as const satisfies Record<string, CoachTip>;

export type CoachTipId = keyof typeof COACH_TIPS;

/** Which tip goes first when several are asked for on the same page. */
export const COACH_TIP_ORDER: readonly CoachTipId[] = [
  'points',
  'twoPhotos',
  'waiting',
  'feedLocked',
  'bell',
  'tagMates',
];

function isTipId(id: unknown): id is CoachTipId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(COACH_TIPS, id);
}

/** AsyncStorage key for the tips this account has closed on this device. */
export function coachSeenKey(userId: string): string {
  return `@mahi:coach_tips_seen:${userId}`;
}

/** The saved list of closed tips; nothing saved, or anything unreadable, is none. */
export function parseSeenTips(raw: string | null): CoachTipId[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(isTipId) : [];
  } catch {
    return [];
  }
}

export function serializeSeenTips(seen: readonly CoachTipId[]): string {
  return JSON.stringify(seen);
}

/**
 * The one tip to show now, or null. `requested`: tips whose thing is on screen and makes sense
 * now; `seen`: closed before (null = not read yet); `page`: the page on screen; `blocked`:
 * something else is up; `current`: the tip already showing, which stays rather than swapping.
 */
export function nextCoachTip({
  requested,
  seen,
  page,
  blocked,
  current,
}: {
  requested: readonly CoachTipId[];
  seen: readonly CoachTipId[] | null;
  page: string;
  blocked: boolean;
  current: CoachTipId | null;
}): CoachTipId | null {
  if (blocked || seen === null) return null;
  const fits = (id: CoachTipId) =>
    requested.includes(id) && !seen.includes(id) && COACH_TIPS[id].page === page;
  if (current && fits(current)) return current;
  return COACH_TIP_ORDER.find(fits) ?? null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The anchor is laid out and its middle is inside the page (not on another page, not slid off). */
export function anchorOnScreen(anchor: Rect, container: { width: number; height: number }) {
  if (anchor.width <= 0 || anchor.height <= 0) return false;
  const cx = anchor.x + anchor.width / 2;
  const cy = anchor.y + anchor.height / 2;
  return cx >= 0 && cx <= container.width && cy >= 0 && cy <= container.height;
}

export interface BubblePlacement {
  /** Above the anchor (it's in the lower half), else below it. */
  above: boolean;
  /** Below: the bubble's top. Above: its bottom, from the bottom of the page. */
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  /** Where the arrow starts along the bubble's edge. */
  arrowLeft: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/**
 * Where the bubble goes: beside the anchor on the side with more room, centred on it but kept
 * `margin` inside the page, with its arrow pointing at the anchor's middle and clear of the
 * bubble's rounded corners. `anchor` is in the page's own coordinates.
 */
export function coachBubblePlacement({
  anchor,
  container,
  maxWidth,
  margin,
  gap,
  arrow,
  radius,
}: {
  anchor: Rect;
  container: { width: number; height: number };
  maxWidth: number;
  margin: number;
  gap: number;
  arrow: number;
  radius: number;
}): BubblePlacement {
  const width = Math.min(maxWidth, container.width - margin * 2);
  const centerX = anchor.x + anchor.width / 2;
  const left = clamp(centerX - width / 2, margin, container.width - margin - width);
  const arrowLeft = clamp(centerX - left - arrow / 2, radius, width - radius - arrow);
  const above = anchor.y + anchor.height / 2 > container.height / 2;
  return above
    ? { above, bottom: container.height - anchor.y + gap, left, width, arrowLeft }
    : { above, top: anchor.y + anchor.height + gap, left, width, arrowLeft };
}
