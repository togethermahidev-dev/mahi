/**
 * The point-earned moment (owner, 2026-10-07, #116): the first ever point keeps the full-screen
 * celebration (PointCelebration.tsx, words in mahiPoints.ts); every later answer sends a "+1"
 * up from the shutter and into the points counter, which rolls up, with a small card under it
 * naming the mate ("@sam kept you going"). Milestones add a burst of accent dots. Pure and
 * unit-tested; the views are src/components/PointFlight.tsx and the camera's PointsCounter.
 */
import { MOTION } from '@/constants/tokens';
import { mahiPointsCount, pointsMilestone } from './mahiPoints';

/** Which moment a confirmed post gets: the full screen, the flight, or nothing (no point). */
export function pointMoment({
  firstPost,
  answered,
  replayed,
}: {
  /** The person's first ever post (it earns the first point). */
  firstPost: boolean;
  /** How many tags the post answered. */
  answered: number;
  /** The server had already counted this post (a retry): no second moment. */
  replayed: boolean;
}): 'celebrate' | 'fly' | null {
  if (replayed) return null;
  if (firstPost) return 'celebrate';
  return answered > 0 ? 'fly' : null;
}

/**
 * Whether the counter keeps its old number from the moment Post is pressed, so the "+1" has
 * something to land in (the optimistic total would otherwise show before it arrives).
 */
export function willFly({
  firstPost,
  answersTag,
}: {
  firstPost: boolean;
  answersTag: boolean;
}): boolean {
  return !firstPost && answersTag;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Where the "+1" is at `t` (0 at the shutter, 1 in the counter): a straight line lifted into an
 * arc, shrinking as it lands. Clamped, so it never carries past the counter.
 */
export function flyPoint(
  t: number,
  from: Point,
  to: Point
): { x: number; y: number; scale: number } {
  'worklet';
  const p = Math.min(1, Math.max(0, t));
  return {
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p - Math.sin(Math.PI * p) * MOTION.flyArc,
    scale: 1 - (1 - MOTION.flyToScale) * p,
  };
}

/** Where each milestone dot ends up, round the counter. */
export function burstDots(): Point[] {
  return Array.from({ length: MOTION.burstDots }, (_, i) => {
    const angle = (2 * Math.PI * i) / MOTION.burstDots;
    const x = MOTION.burstSpread * Math.cos(angle);
    const y = MOTION.burstSpread * Math.sin(angle);
    return { x: Math.abs(x) < 1e-9 ? 0 : x, y: Math.abs(y) < 1e-9 ? 0 : y };
  });
}

const ROUND_NUMBERS = [5, 10, 25, 50, 100];

/** The small card under the counter once the "+1" has landed, and what VoiceOver says. */
export function flightCard({
  tagger,
  points,
  bestBefore,
}: {
  /** The mate whose tag this answered (the oldest), or null. */
  tagger: string | null;
  /** Points after the post. */
  points: number;
  /** The best before the post. */
  bestBefore: number;
}): { title: string; line: string; milestone: boolean; liveText: string } {
  const title = tagger ? `@${tagger} kept you going` : 'A friend kept you going';
  const total = mahiPointsCount(points);
  const newBest = points > bestBefore;
  const line = newBest
    ? `New best: ${total}.`
    : ROUND_NUMBERS.includes(points)
      ? `That’s ${points} Mahi points without a miss.`
      : points === 1 && bestBefore > 0
        ? `Welcome back. You have ${total}.`
        : `You have ${total}.`;
  return {
    title,
    line,
    milestone: pointsMilestone(points, bestBefore),
    liveText: `Plus 1 Mahi point, ${total}.${newBest ? ' New best.' : ''} ${title}.`,
  };
}

/**
 * Apple's rolling digits on an iPhone build with @expo/ui; ours elsewhere. Reduce Motion gets
 * ours too (the number simply changes), since Apple's would roll regardless.
 */
export function nativeDigits({
  platform,
  expoUiPresent,
  reduceMotion,
}: {
  platform: string;
  expoUiPresent: boolean;
  reduceMotion: boolean;
}): boolean {
  return platform === 'ios' && expoUiPresent && !reduceMotion;
}

/**
 * Which way the counter rolls when its number changes within this session: up for a point, down
 * after a miss (owner, 2026-10-07: once, not in red, before the miss moment). Nothing on the
 * first number of a session: what was there before is never kept on the phone.
 */
export function pointsRoll(before: number | null, after: number | null): 'up' | 'down' | null {
  if (before === null || after === null || before === after) return null;
  return after > before ? 'up' : 'down';
}

/** The number shown at `t` (0 → 1) of a roll from `from` to `to`, eased out, whole. */
export function rollValue(from: number, to: number, t: number): number {
  const p = Math.min(1, Math.max(0, t));
  const eased = 1 - Math.pow(1 - p, 3);
  return Math.round(from + (to - from) * eased);
}
