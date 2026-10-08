/** Geometry shared by Mahi's source-to-destination morphs. Pure so it is unit-tested. */
import { MOTION } from '@/constants/tokens';
export type MorphRect = { x: number; y: number; width: number; height: number };

export type MorphSource = MorphRect & {
  uri: string;
  borderRadius: number;
};

export function morphNumber(from: number, to: number, progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return from + (to - from) * p;
}

export function morphRect(from: MorphRect, to: MorphRect, progress: number): MorphRect {
  return {
    x: morphNumber(from.x, to.x, progress),
    y: morphNumber(from.y, to.y, progress),
    width: morphNumber(from.width, to.width, progress),
    height: morphNumber(from.height, to.height, progress),
  };
}

export function validMorphSource(source: MorphSource | null | undefined): source is MorphSource {
  return !!source?.uri && source.width > 0 && source.height > 0;
}

/**
 * A page growing in from a tab tap (owner, 2026-10-08, Netflix-style): the same shared morph
 * progress, read as the page's opacity, scale and corner radius. Fully solid by the point the
 * shared morph joins its content (MOTION.morphContentAt), so it never looks washed out at rest.
 */
export function pageMorphFrame(progress: number): {
  opacity: number;
  scale: number;
  borderRadius: number;
} {
  'worklet';
  const p = Math.max(0, Math.min(1, progress));
  return {
    opacity: Math.min(1, p / MOTION.morphContentAt),
    scale: morphNumber(MOTION.pageMorph.fromScale, 1, p),
    borderRadius: morphNumber(MOTION.pageMorph.fromRadius, 0, p),
  };
}
