/**
 * The moment after a miss (usability walkthrough, 2026-10-07): on the next open, one full-screen
 * "You missed @sam's tag" (words: `missMoment` in mahiPoints.ts; the screen:
 * src/components/MissMoment.tsx). One per miss, picked from the `streak_lost` notifications the
 * server sends only when the miss cost points. Which ones were shown is kept on the phone: a seen
 * mark never expires. Pure and import-free so it runs under the node-only jest harness.
 */

/** Misses older than this never get a moment (someone opening a new update after weeks away). */
const SHOW_WITHIN_MS = 3 * 24 * 3600 * 1000;
/** Seen ids kept per account; older ones are long past SHOW_WITHIN_MS. */
const KEEP_SEEN = 50;

/** The newest `streak_lost` from the last 3 days not yet shown on this phone, or null. */
export function missToShow(
  items: { id: string; type: string; created_at: string; actor: { username: string } }[],
  seen: string[],
  now: number = Date.now()
): { id: string; tagger: string } | null {
  const miss = items
    .filter((n) => n.type === 'streak_lost' && !seen.includes(n.id))
    .filter((n) => now - Date.parse(n.created_at) <= SHOW_WITHIN_MS)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return miss ? { id: miss.id, tagger: miss.actor.username } : null;
}

/** AsyncStorage key for "these misses have had their moment on this device". */
export function missSeenKey(userId: string): string {
  return `@mahi:miss_moments_seen:${userId}`;
}

export function parseSeenMisses(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The seen list with `id` added (once), keeping the newest 50. */
export function seenMissesAfter(seen: string[], id: string): string[] {
  if (seen.includes(id)) return seen;
  return [...seen, id].slice(-KEEP_SEEN);
}
