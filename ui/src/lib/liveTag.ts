/**
 * A mate's tag, kept in view without opening Mahi (owner, 2026-10-07: "bring Mahi up to speed with
 * BeReal/Locket"): a Live Activity on the lock screen and Dynamic Island while a tag waits for an
 * answer, and a home-screen widget that shows the same tag, or the person's Mahi points when
 * nothing is waiting.
 *
 * Pure: what to show from the tags, the points and the time; which tag is soonest; when the warning
 * colour starts; and whether to start, update or end the one Live Activity. The layouts are in
 * src/widgets/liveTagWidgets.tsx and the wiring in src/hooks/useLiveTag.ts. Only the username and
 * the points ever leave the app (they sit in the shared App Group storage the widget reads).
 *
 * Deadlines arrive on the server's clock (`serverOffsetMs` = server − device); the native timers
 * tick on the phone's clock, so every time here is turned into phone time.
 */
import { COLORS, SIZE, SPACE } from '@/constants/tokens';
import { URGENT_TAG_MS } from './openTagsBanner';
import { mahiPointsCount } from './mahiPoints';

/** Where a tap on the Live Activity or the widget goes: the camera, to answer. */
export const LIVE_TAG_URL = 'mahi://camera';

const CAMERA_LINK = /^mahi:\/\/\/?camera\/?(?:[?#].*)?$/i;

/** True for the Live Activity's and widget's own link. */
export function isCameraLink(url: string | null | undefined): boolean {
  return !!url && CAMERA_LINK.test(url.trim());
}

/** What a tag must carry (an OpenTag from get_open_tags has all of it). */
export interface LiveTagTag {
  challenge_id: string;
  username: string;
  created_at: string;
  expires_at: string;
}

/**
 * Colours and sizes, from the tokens. The widget layouts can't import anything (they run in the
 * widget's own JavaScript), so these travel with the content. Always the dark background.
 */
export interface LiveTagLook {
  accent: string;
  warning: string;
  bg: string;
  text: string;
  muted: string;
  /** Room between lines. */
  gap: number;
  /** Padding round the lock-screen banner. */
  pad: number;
  /** Width of the timer in the Dynamic Island, so it doesn't take the whole island. */
  timerWidth: number;
  /** The tagger's round photo: on the lock screen and widget, and in the Dynamic Island. */
  photo: number;
  photoSmall: number;
}

export const LIVE_TAG_LOOK: LiveTagLook = {
  accent: COLORS.accent,
  warning: COLORS.warning,
  bg: COLORS.bgDark,
  text: COLORS.offWhite,
  muted: COLORS.grey999,
  gap: SPACE.s4,
  pad: SPACE.s16,
  timerWidth: SIZE.z64,
  photo: SIZE.z36,
  photoSmall: SIZE.z24,
};

/** A tag waiting for an answer: the Live Activity and the widget. */
export interface TagView {
  kind: 'tag';
  /** "@sam is waiting on you". */
  title: string;
  /** "+2 more" with several tags, else null. */
  more: string | null;
  line: string;
  /** The word beside the timer. */
  left: string;
  /** Timer range on the phone's clock (ms): it counts down to `deadline`. */
  start: number;
  deadline: number;
  /** 6 hours or less left: drawn in the warning colour (from the 6-hour mark on). */
  warning: boolean;
  /** The tagger's photo, saved where the widget can read it (a file URL), or null. */
  photo: string | null;
  look: LiveTagLook;
}

/** Nothing waiting: the widget shows the points. */
export interface WaitingView {
  kind: 'waiting';
  title: string;
  /** "12 Mahi points". */
  points: string;
  /** "Best: 20". */
  best: string;
  look: LiveTagLook;
}

/** Signed out (or the switch is off): nothing personal. */
export interface OffView {
  kind: 'off';
  title: string;
  look: LiveTagLook;
}

export type LiveTagView = TagView | WaitingView | OffView;

/** A tag's deadline on the phone's clock (ms). */
function deviceDeadline(t: LiveTagTag, serverOffsetMs: number): number {
  return Date.parse(t.expires_at) - serverOffsetMs;
}

/** Tags still open at `deviceAt` (phone time), the soonest deadline first. */
export function openTagsAt<T extends LiveTagTag>(
  tags: T[],
  serverOffsetMs: number,
  deviceAt: number
): T[] {
  return tags
    .filter((t) => deviceDeadline(t, serverOffsetMs) > deviceAt)
    .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
}

/** The soonest open tag's id, or null when nothing is open. */
export function soonestTagId(
  tags: LiveTagTag[],
  serverOffsetMs: number,
  deviceNow: number
): string | null {
  return openTagsAt(tags, serverOffsetMs, deviceNow)[0]?.challenge_id ?? null;
}

export interface LiveTagInput {
  tags: LiveTagTag[];
  serverOffsetMs: number;
  deviceNow: number;
  /** Mahi points and best, as the profile has them. */
  points: number;
  best: number;
  /** Taggers' photos saved for the widget, by username (none when the switch is off). */
  photos?: Record<string, string>;
  /** False for someone who has never posted: their first post needs no tag. */
  postedBefore?: boolean;
}

/** What the Live Activity and widget show at `deviceNow`. */
export function liveTagView({
  tags,
  serverOffsetMs,
  deviceNow,
  points,
  best,
  photos = {},
  postedBefore = true,
}: LiveTagInput): TagView | WaitingView {
  const open = openTagsAt(tags, serverOffsetMs, deviceNow);
  const first = open[0];
  if (!first) {
    return {
      kind: 'waiting',
      title: postedBefore
        ? 'Waiting for a mate to tag you'
        : 'Post your first workout to get your first point',
      points: mahiPointsCount(points),
      best: `Best: ${best}`,
      look: LIVE_TAG_LOOK,
    };
  }
  const deadline = deviceDeadline(first, serverOffsetMs);
  const others = open.length - 1;
  return {
    kind: 'tag',
    title: `@${first.username} is waiting on you`,
    more: others > 0 ? `+${others} more` : null,
    line: 'Answer with any workout',
    left: 'left',
    start: Math.min(Date.parse(first.created_at) - serverOffsetMs, deviceNow),
    deadline,
    warning: deadline - deviceNow <= URGENT_TAG_MS,
    photo: photos[first.username] ?? null,
    look: LIVE_TAG_LOOK,
  };
}

/**
 * Where a tagger's photo is saved for the widget and Live Activity: in expo-widgets' shared
 * folder (`dir`, the App Group), one small file per mate. Widgets can't fetch from the internet,
 * so the app saves it there first (owner, 2026-10-07, #117).
 */
/** The saved photo's size (px, square) and JPEG quality: small, as widgets and Live Activities
 *  must be. */
export const TAGGER_PHOTO = { px: SIZE.z96, quality: 0.8 };

export function taggerPhotoFile(dir: string, username: string): string {
  const safe = username
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/^\.+/, '');
  return `${dir.replace(/\/$/, '')}/tagger-${safe}.jpg`;
}

/** Signed out or switched off: the widget shows this, with nothing personal in it. */
export function offView(): OffView {
  return { kind: 'off', title: 'Open Mahi to see your tags', look: LIVE_TAG_LOOK };
}

/**
 * When the Live Activity goes stale on its own (its layout then draws the warning colour): the
 * 6-hour mark while it's ahead, else the deadline. The app can't update the activity while it's
 * closed, but iOS re-draws it at this time.
 */
export function liveActivityStaleAt(deadline: number, deviceNow: number): number {
  const warnAt = deadline - URGENT_TAG_MS;
  return warnAt > deviceNow ? warnAt : deadline;
}

/** The 6-hour marks and deadlines still ahead (phone time), in order. */
function changesAfter(tags: LiveTagTag[], serverOffsetMs: number, deviceNow: number): number[] {
  const times = openTagsAt(tags, serverOffsetMs, deviceNow).flatMap((t) => {
    const deadline = deviceDeadline(t, serverOffsetMs);
    return [deadline - URGENT_TAG_MS, deadline];
  });
  return [...new Set(times.filter((t) => t > deviceNow))].sort((a, b) => a - b);
}

/** When something on screen next changes by itself, or null with no open tag. */
export function nextLiveTagChange(
  tags: LiveTagTag[],
  serverOffsetMs: number,
  deviceNow: number
): number | null {
  return changesAfter(tags, serverOffsetMs, deviceNow)[0] ?? null;
}

/**
 * The widget's timeline: now, then each 6-hour mark and deadline, so it turns to the warning
 * colour, moves on to the next tag and stops showing a tag once it's over, without the app. A tag
 * that ends unanswered puts the points back to 0 (Mahi points rule); the best stays.
 */
export function widgetTimeline(input: LiveTagInput): { date: number; props: LiveTagView }[] {
  const { tags, serverOffsetMs, deviceNow } = input;
  return [deviceNow, ...changesAfter(tags, serverOffsetMs, deviceNow)].map((at) => {
    const missed = tags.some((t) => {
      const d = deviceDeadline(t, serverOffsetMs);
      return d > deviceNow && d <= at;
    });
    return {
      date: at,
      props: liveTagView({ ...input, deviceNow: at, points: missed ? 0 : input.points }),
    };
  });
}

export type LiveActivityAction = 'start' | 'update' | 'end' | 'none';

/**
 * What to do with the one Live Activity. `shownFor` is the tag one was last started for in this
 * session: if it's gone while that tag is still the soonest, the person swiped it away (or iOS
 * ended it after its 8 hours), so it isn't brought back until a different tag is the soonest.
 */
export function liveActivityAction({
  enabled,
  signedIn,
  loaded,
  running,
  soonestTagId: soonest,
  shownFor,
}: {
  /** The switch is on and this build has Live Activities. */
  enabled: boolean;
  signedIn: boolean;
  /** This session has read the open tags. */
  loaded: boolean;
  running: boolean;
  soonestTagId: string | null;
  shownFor: string | null;
}): LiveActivityAction {
  if (!enabled || !signedIn) return running ? 'end' : 'none';
  if (!loaded) return 'none';
  if (!soonest) return running ? 'end' : 'none';
  if (running) return 'update';
  return soonest === shownFor ? 'none' : 'start';
}
