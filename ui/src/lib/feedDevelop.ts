/**
 * The feed "develops" after you post (design research, 2026-10-07): the mates' posts that were
 * locked clear one by one, like prints, the mate whose tag you answered first, each
 * MOTION.develop.staggerMs after the one before. It plays only on fresh posts from the server
 * (a locked post has no photo, so nothing saved can show first). Pure and unit-tested; the view
 * is DevelopCover in src/screens/FeedScreen.tsx.
 */
import { MOTION } from '@/constants/tokens';

type DevelopPost = {
  id: string;
  locked: boolean;
  profiles: { id: string; username: string };
  response?: { tagger_username: string; seconds: number } | null;
};

/** How long the `index`th post to clear waits (ms); all together with Reduce Motion. */
export function developDelay(index: number, reduceMotion = false): number {
  if (reduceMotion) return 0;
  return Math.min(index, MOTION.develop.staggerMax) * MOTION.develop.staggerMs;
}

/** The mate whose tag your newest post answered, or null. */
function answeredTagger(posts: DevelopPost[], viewerId: string): string | null {
  const mine = posts.find((p) => p.profiles.id === viewerId);
  return mine?.response?.tagger_username ?? null;
}

/**
 * Which posts clear and when (post id → delay in ms), in the order they clear: posts seen
 * locked this session that are now open and still in the feed, never your own; the answered
 * mate's first, then feed order.
 */
export function developPlan({
  posts,
  previouslyLocked,
  viewerId,
  reduceMotion = false,
}: {
  posts: DevelopPost[];
  previouslyLocked: readonly string[];
  viewerId: string;
  reduceMotion?: boolean;
}): Map<string, number> {
  const was = new Set(previouslyLocked);
  const tagger = answeredTagger(posts, viewerId);
  const open = posts.filter((p) => was.has(p.id) && !p.locked && p.profiles.id !== viewerId);
  const ordered = [
    ...open.filter((p) => p.profiles.username === tagger),
    ...open.filter((p) => p.profiles.username !== tagger),
  ];
  return new Map(ordered.map((p, i) => [p.id, developDelay(i, reduceMotion)]));
}

/** The words on the first post to clear: whose tag you answered. */
export function developWords({
  posts,
  viewerId,
}: {
  posts: DevelopPost[];
  viewerId: string;
}): string | null {
  const tagger = answeredTagger(posts, viewerId);
  return tagger ? `You answered @${tagger}. Here’s what your friends did.` : null;
}
