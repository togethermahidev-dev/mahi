/**
 * Where the small draggable photo (the second camera's shot, FaceTime-style) may sit on a
 * full-screen post. Pure so it can be unit-tested; DraggablePip calls these from its gesture.
 * Positions are the photo's top-left corner, on the post.
 *
 * It never covers the name, the line under it or the caption (owner, 2026-10-10: "make sure it
 * never does on all posts"):
 * - its lowest spot is worked out from where THIS post's name row starts — a measurement taken on
 *   another post (a reused list cell) is never used (`measuredTextTop`);
 * - until this post's name row has been measured it isn't drawn at all (`pipPlacement` gives null);
 * - it is drawn inside a fence that ends above the name row, so a position that is a frame behind
 *   a change is cut off at the fence instead of showing over the name;
 * - a drag is held inside the zone and rests on one of its corners.
 */
import {
  BORDER_WIDTH,
  LAYOUT,
  LINE_HEIGHT,
  OFFSET,
  POST_FULL,
  SIZE,
  SPACE,
} from '@/constants/tokens';

export const PIP_W = SIZE.z90;
export const PIP_H = SIZE.z120;

/** Gap between the small photo and the name row under it. */
const TEXT_GAP = SPACE.s12;
/** Space kept free on the right for the like / comment buttons. */
const SIDE_ACTIONS_W = SIZE.z70;
const EDGE = SPACE.s8;

export type PipZone = { left: number; right: number; top: number; bottom: number };

/** Height of AppHeader: the status-bar inset, its 36px row and 12px bottom padding. */
export function appHeaderHeight(topInset: number): number {
  return topInset + SIZE.z36 + SPACE.s12;
}

/** Top of the camera's top-right corner items (points counter, discard ✕): just under the header. */
export function cameraCornerTop(topInset: number): number {
  return topInset + OFFSET.o48;
}

/**
 * Top of the camera's open-tags pill: under the points counter, so the two never overlap. The
 * counter is its padding, one line and its border, and grows with text size up to its cap.
 */
export function openTagsTop(topInset: number, fontScale: number): number {
  const scale = Math.min(Math.max(fontScale, 1), LAYOUT.largeTextScale);
  const counter = SPACE.s8 * 2 + LINE_HEIGHT.l24 * scale + BORDER_WIDTH.w1 * 2;
  return cameraCornerTop(topInset) + Math.ceil(counter) + SPACE.s8;
}

// ─── Where this post's name row starts ────────────────────────────────────────

/** Where a post's name row starts (pt from the top of the post), and the post it was measured on. */
export type PipMeasure = { postId: string; textTop: number };

/** The measured start of this post's name row, or null: another post's measurement never counts. */
export function measuredTextTop(measure: PipMeasure | null, postId: string): number | null {
  return measure && measure.postId === postId ? measure.textTop : null;
}

/** Whether a new measurement says what is already known (so nothing needs redrawing). */
export function sameTextTop(measure: PipMeasure | null, postId: string, textTop: number): boolean {
  return (
    !!measure &&
    measure.postId === postId &&
    Math.abs(measure.textTop - textTop) < POST_FULL.measureSlack
  );
}

/**
 * The two layout reports that place the name row: the shade's top on the post and the name row's
 * top inside the shade. Both must be this post's own.
 */
export type PipTextParts = { postId: string; shadeY: number | null; rowY: number | null };

/** The parts with one more report in; a report for another post starts them again. */
export function withTextPart(
  parts: PipTextParts,
  postId: string,
  part: 'shadeY' | 'rowY',
  y: number
): PipTextParts {
  const known = parts.postId === postId ? parts : { postId, shadeY: null, rowY: null };
  return part === 'shadeY' ? { ...known, shadeY: y } : { ...known, rowY: y };
}

export function textTopFromParts(parts: PipTextParts, postId: string): number | null {
  if (parts.postId !== postId || parts.shadeY == null || parts.rowY == null) return null;
  return parts.shadeY + parts.rowY;
}

// ─── Where it may sit ─────────────────────────────────────────────────────────

/** The zone it may move in, and how far down the post its fence reaches. */
export type PipPlacement = { zone: PipZone; fence: number };

/**
 * Where the small photo may sit on this post, or null when it isn't drawn: before the post's name
 * row has been measured (`textTop` null), or when the text runs so high there is no room for it.
 *
 * `textTop` is where the name row starts (the caption and tags are under it): the photo's lowest
 * spot ends TEXT_GAP above it, at any text size. `top` is the highest it normally goes; a tall
 * text block squeezes it up as far as `minTop` (just under the header), never over the text.
 */
export function pipPlacement(
  card: { width: number; height: number },
  top: number,
  minTop: number,
  textTop: number | null
): PipPlacement | null {
  if (textTop == null) return null;
  const lowest = Math.min(textTop, card.height) - TEXT_GAP - PIP_H;
  if (lowest < minTop) return null;
  return {
    zone: {
      left: EDGE,
      right: Math.max(EDGE, card.width - PIP_W - SIDE_ACTIONS_W),
      top: Math.min(top, lowest),
      bottom: lowest,
    },
    // Past the photo's resting edge by its lift and shadow, and still short of the name row.
    fence: lowest + PIP_H + POST_FULL.pipFenceBleed,
  };
}

export function clampToZone(x: number, y: number, zone: PipZone): { x: number; y: number } {
  'worklet';
  return {
    x: Math.max(zone.left, Math.min(x, zone.right)),
    y: Math.max(zone.top, Math.min(y, zone.bottom)),
  };
}

export function snapToCorner(x: number, y: number, zone: PipZone): { x: number; y: number } {
  'worklet';
  return {
    x: x < (zone.left + zone.right) / 2 ? zone.left : zone.right,
    y: y < (zone.top + zone.bottom) / 2 ? zone.top : zone.bottom,
  };
}
