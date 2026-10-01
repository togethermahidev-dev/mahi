/**
 * Tag-picker nudge: flag a friend nobody has tagged for `nudgeDays` days.
 * Pure so it can be unit-tested; the server supplies `lastTaggedAt` and `nudgeDays`.
 */
const DAY_MS = 24 * 3600 * 1000;

export function nudgeLabel(
  lastTaggedAt: string | null,
  hasOpenTag: boolean,
  nudgeDays: number,
  nowMs: number = Date.now()
): string | null {
  if (hasOpenTag) return null;
  if (lastTaggedAt === null) return 'not tagged yet — tag them';
  if (nowMs - Date.parse(lastTaggedAt) < nudgeDays * DAY_MS) return null;
  return `not tagged in ${nudgeDays} days — tag them`;
}
