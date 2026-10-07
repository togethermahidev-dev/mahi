/**
 * The last 6 hours of a tag (design research, 2026-10-07): the clock gets a heartbeat. A ring
 * round the tagger's face on the camera pill drains with the time left, breathes slowly in the
 * last hour, and one gentle tap marks crossing into that hour. Never red, never flashing. Pure and
 * unit-tested; the view is the urgent pill in src/components/OpenTagsBanner.tsx.
 */
import { URGENT_TAG_MS, type BannerPart } from './openTagsBanner';

const HOUR_MS = 3600 * 1000;

/** How full the ring is (1 as the last 6 hours begin, 0 at the deadline), and whether it breathes. */
export function urgentRing(msLeft: number): { progress: number; breathing: boolean } {
  const progress = Math.min(1, Math.max(0, msLeft / URGENT_TAG_MS));
  return { progress, breathing: msLeft > 0 && msLeft < HOUR_MS };
}

/**
 * True on the tick that crosses into the last hour (`before` was the time left on the last tick,
 * null on the first): one gentle tap, once. Opening the camera already inside the hour crosses
 * nothing.
 */
export function crossedLastHour(before: number | null, now: number): boolean {
  return before !== null && before >= HOUR_MS && now < HOUR_MS;
}

/**
 * The urgent pill's words and clock apart, so the clock can roll on its own line: "@sam is
 * waiting on you" / "05:12:33" / " left". `clock` is null when there are only minutes left.
 */
export function urgentPillLines(parts: BannerPart[]): {
  words: string;
  clock: string | null;
  after: string;
} {
  const words = parts
    .filter((p) => !p.accent)
    .map((p) => p.text)
    .join('')
    .replace(/\s*·\s*$/, '');
  const accent = parts.find((p) => p.accent)?.text ?? '';
  const match = /^(\d+:\d{2}:\d{2})(.*)$/.exec(accent);
  return match
    ? { words, clock: match[1], after: match[2] }
    : { words, clock: null, after: accent };
}
