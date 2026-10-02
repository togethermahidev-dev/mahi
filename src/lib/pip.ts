/**
 * Where the small draggable photo (the second camera's shot, FaceTime-style) may sit on a
 * full-screen post. Pure so it can be unit-tested; DraggablePip calls these from its gesture.
 * Positions are the photo's top-left corner.
 */
import { SIZE, SPACE } from '@/constants/tokens';

export const PIP_W = 90;
export const PIP_H = 120;

/** Space kept free at the bottom for the avatar, caption and their padding. */
const BOTTOM_CONTENT_H = 200;
/** Space kept free on the right for the like / comment buttons. */
const SIDE_ACTIONS_W = 70;
const EDGE = 8;

export type PipZone = { left: number; right: number; top: number; bottom: number };

/** Height of AppHeader: the status-bar inset, its 36px row and 12px bottom padding. */
export function appHeaderHeight(topInset: number): number {
  return topInset + SIZE.z36 + SPACE.s12;
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
