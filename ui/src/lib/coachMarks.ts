/**
 * One-time tips (coach marks) where people get lost (owner, 2026-10-07: "they can't just be
 * expected to know"). Each tip points at one thing on one page, shows once per account on this
 * device, and goes on a tap anywhere or "Got it". Never more than one at a time, and never over
 * the welcome cards, a sheet, a toast, the point celebration or the notifications page.
 *
 * How a tip looks (owner, 2026-10-07: "any native tooltips?"): on an iPhone build with @expo/ui,
 * Apple's own popover, anchored to the thing; elsewhere (build 10, Android) our own: the page dims
 * around a bright cut-out of the thing, with a frosted bubble whose arrow points at its middle.
 * Pure and SDK-free so the rules and the geometry are unit-tested; the views are
 * src/components/CoachMark.tsx.
 */

/** The page a tip belongs to: one of the swipe pages, or the post preview ('compose'). */
export type CoachPage = 'camera' | 'feed' | 'compose';

/** The small picture beside a tip's words. */
export type CoachIcon = 'plusOne' | 'camera' | 'feed' | 'notifications' | 'people';

export interface CoachTip {
  /** Bold and short, no full stop. */
  title: string;
  /** One line. */
  body: string;
  page: CoachPage;
  icon: CoachIcon;
}

/** Every tip, in the founder's words ("mates"). */
export const COACH_TIPS = {
  points: {
    title: 'Your Mahi points',
    body: 'First workout and each answer earn 1.',
    page: 'camera',
    icon: 'plusOne',
  },
  bell: {
    title: 'A friend tagged you',
    body: 'Tap to answer.',
    page: 'feed',
    icon: 'notifications',
  },
  twoPhotos: {
    title: 'Two photos',
    body: 'What you see, then a selfie.',
    page: 'camera',
    icon: 'camera',
  },
  waiting: {
    title: 'You’ll post again when a friend tags you',
    body: 'Check back each day.',
    page: 'camera',
    icon: 'notifications',
  },
  // The handle says this once in words. VoiceOver can activate the arrow as a button.
  pullDown: {
    title: 'Pull down to open',
    body: 'Your actions are behind the camera.',
    page: 'camera',
    icon: 'people',
  },
  feedLocked: {
    title: 'Your feed opens when you post',
    body: 'Answer tags to keep it open.',
    page: 'feed',
    icon: 'feed',
  },
  tagMates: {
    title: 'Tag 3 friends',
    body: 'Each gets 48 hours to post back.',
    page: 'compose',
    icon: 'people',
  },
} as const satisfies Record<string, CoachTip>;

export type CoachTipId = keyof typeof COACH_TIPS;

/** Which tip goes first when several are asked for on the same page. */
export const COACH_TIP_ORDER: readonly CoachTipId[] = [
  'points',
  'twoPhotos',
  'waiting',
  'pullDown',
  'feedLocked',
  'bell',
  'tagMates',
];

/** The tip as VoiceOver reads it. */
export function coachTipText(id: CoachTipId): string {
  return `${COACH_TIPS[id].title}. ${COACH_TIPS[id].body}`;
}

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

/** The unseen tips asked for on this page, in the order they show (none until seen is read). */
export function coachQueue({
  requested,
  seen,
  page,
}: {
  requested: readonly CoachTipId[];
  seen: readonly CoachTipId[] | null;
  page: string;
}): CoachTipId[] {
  if (seen === null) return [];
  return COACH_TIP_ORDER.filter(
    (id) => requested.includes(id) && !seen.includes(id) && COACH_TIPS[id].page === page
  );
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
  if (blocked) return null;
  const queue = coachQueue({ requested, seen, page });
  if (current && queue.includes(current)) return current;
  return queue[0] ?? null;
}

/** "2 of 3" while tips wait their turn on a page: `done` closed this visit, `left` still to go
 * (this one included). Nothing for a tip on its own. */
export function coachStepLabel(done: number, left: number): string | null {
  const total = done + left;
  return total > 1 && left > 0 ? `${done + 1} of ${total}` : null;
}

/** Apple's popover on an iPhone build with @expo/ui; our own tip everywhere else. */
export function tipPresenter(platform: string, expoUiPresent: boolean): 'native' | 'custom' {
  return platform === 'ios' && expoUiPresent ? 'native' : 'custom';
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Measuring rounds a little; less than this is the same place. */
const HAIR = 1;

/** The thing is laid out and wholly on the page (not on another page, not slid partly off). */
export function anchorVisible(anchor: Rect, container: { width: number; height: number }) {
  if (anchor.width <= 0 || anchor.height <= 0) return false;
  return (
    anchor.x >= -HAIR &&
    anchor.y >= -HAIR &&
    anchor.x + anchor.width <= container.width + HAIR &&
    anchor.y + anchor.height <= container.height + HAIR
  );
}

/** Two measurements of the same thing agree: it has settled (no swipe or slide in progress). */
export function sameRect(a: Rect, b: Rect | null): boolean {
  if (!b) return false;
  return (
    Math.abs(a.x - b.x) < HAIR &&
    Math.abs(a.y - b.y) < HAIR &&
    Math.abs(a.width - b.width) < HAIR &&
    Math.abs(a.height - b.height) < HAIR
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** The bright cut-out: the target with `pad` of room around it, kept inside the page. */
export function spotlightRect(
  anchor: Rect,
  pad: number,
  container: { width: number; height: number }
): Rect {
  const x = Math.max(0, anchor.x - pad);
  const y = Math.max(0, anchor.y - pad);
  const right = Math.min(container.width, anchor.x + anchor.width + pad);
  const bottom = Math.min(container.height, anchor.y + anchor.height + pad);
  return { x, y, width: right - x, height: bottom - y };
}

/** An SVG path for a rectangle with round corners, never rounder than half its height or width. */
export function roundedRectPath({ x, y, width, height }: Rect, radius: number): string {
  const r = Math.min(radius, height / 2, width / 2);
  const arc = (ex: number, ey: number) => `A${r} ${r} 0 0 1 ${ex} ${ey}`;
  return (
    `M${x + r} ${y}H${x + width - r}${arc(x + width, y + r)}` +
    `V${y + height - r}${arc(x + width - r, y + height)}` +
    `H${x + r}${arc(x, y + height - r)}` +
    `V${y + r}${arc(x + r, y)}Z`
  );
}

/** The dim layer: the whole page with the cut-out as a hole (draw with fillRule "evenodd"). */
export function spotlightPath(
  container: { width: number; height: number },
  spot: Rect,
  radius: number
): string {
  return `M0 0H${container.width}V${container.height}H0Z${roundedRectPath(spot, radius)}`;
}

export interface BubbleLayout {
  /** Above the target (no room below), else below it. */
  above: boolean;
  top: number;
  left: number;
  width: number;
  /** Where the arrow starts along the bubble's edge facing the target. */
  arrowLeft: number;
}

/**
 * Where the bubble goes: below the cut-out when it fits, else above; with no room either side, the
 * roomier side, kept on screen. Centred on the target but `margin` inside the page; its arrow is on
 * the edge facing the target, at the target's exact middle, clear of the rounded corners.
 */
export function coachBubbleLayout({
  spot,
  container,
  bubbleHeight,
  maxWidth,
  margin,
  gap,
  arrowWidth,
  arrowHeight,
  radius,
  safeTop,
  safeBottom,
}: {
  spot: Rect;
  container: { width: number; height: number };
  bubbleHeight: number;
  maxWidth: number;
  margin: number;
  gap: number;
  arrowWidth: number;
  arrowHeight: number;
  radius: number;
  safeTop: number;
  safeBottom: number;
}): BubbleLayout {
  const width = Math.min(maxWidth, container.width - margin * 2);
  const centerX = spot.x + spot.width / 2;
  const left = clamp(centerX - width / 2, margin, container.width - margin - width);
  const arrowLeft = clamp(centerX - left - arrowWidth / 2, radius, width - radius - arrowWidth);

  const lowest = container.height - safeBottom - margin - bubbleHeight;
  const highest = safeTop + margin;
  const below = spot.y + spot.height + gap + arrowHeight;
  const above = spot.y - gap - arrowHeight - bubbleHeight;
  if (below <= lowest) return { above: false, top: below, left, width, arrowLeft };
  if (above >= highest) return { above: true, top: above, left, width, arrowLeft };
  const roomBelow = container.height - safeBottom - margin - below;
  const roomAbove = spot.y - gap - arrowHeight - highest;
  return roomAbove >= roomBelow
    ? { above: true, top: highest, left, width, arrowLeft }
    : { above: false, top: Math.max(highest, Math.min(below, lowest)), left, width, arrowLeft };
}
