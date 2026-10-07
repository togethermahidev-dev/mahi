/**
 * Where the small draggable photo (the second camera's shot, FaceTime-style) may sit on a
 * full-screen post. Pure so it can be unit-tested; DraggablePip calls these from its gesture.
 * Positions are the photo's top-left corner.
 */
import { BORDER_WIDTH, LAYOUT, LINE_HEIGHT, OFFSET, SIZE, SPACE } from '@/constants/tokens';

export const PIP_W = SIZE.z90;
export const PIP_H = SIZE.z120;

/** Space kept free at the bottom for the avatar, caption and their padding. */
const BOTTOM_CONTENT_H = SIZE.z200;
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

/** The area the photo may move in. `top` is the highest the photo may go. */
export function pipZone(screen: { width: number; height: number }, top: number): PipZone {
  return {
    left: EDGE,
    right: screen.width - PIP_W - SIDE_ACTIONS_W,
    top,
    bottom: screen.height - BOTTOM_CONTENT_H - PIP_H,
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
