/**
 * Tap areas: Apple asks for 44 points, Google for 48. Something drawn smaller keeps its look and
 * gets the rest as invisible `hitSlop` around it. Before adding slop, check the gap to the next
 * button: two tap areas must never overlap.
 */
import { SIZE } from '@/constants/tokens';

export const TAP_AREA = { ios: SIZE.z44, android: SIZE.z48 } as const;

export interface Slop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The hitSlop that grows something `drawn` points across to `target` points, evenly. */
export function tapSlop(drawn: number, target: number): Slop {
  const side = Math.max(0, (target - drawn) / 2);
  return { top: side, bottom: side, left: side, right: side };
}
