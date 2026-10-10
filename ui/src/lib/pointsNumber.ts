/**
 * The room a Mahi points number keeps (owner, 2026-10-10: "sometimes the writing overlaps the
 * number"). Apple's rolling digits tell the layout their size a moment after they are drawn, and
 * grow with the phone's text size with no limit; until then the words beside or under the number
 * were laid out as if it took no room. So the number's room is worked out here, from how many
 * digits it has, before anything is drawn. Pure, so it runs under the node-only tests; the view
 * is src/components/RollingNumber.tsx.
 */
import { POINTS_NUMBER } from '@/constants/tokens';

/** How many characters the number draws: its digits, or one for the dash while it loads. */
export function digitCount(value: number | null | undefined): number {
  if (value === null || value === undefined) return 1;
  return String(Math.abs(Math.trunc(value))).length;
}

export interface NumberBox {
  /** The least room the number keeps, so its words are laid out clear of it. */
  minWidth: number;
  minHeight: number;
  /**
   * The size to hand Apple's digits. They grow with the phone's text size by themselves, so a
   * limit is applied by handing them a smaller size to grow from.
   */
  appleSize: number;
}

export function numberBox({
  value,
  shown,
  size,
  lineHeight,
  fontScale,
  maxScale,
  apple,
}: {
  /** Where the number is heading, and what it shows right now on the way (a roll). */
  value: number | null;
  shown: number | null;
  /** The number's text size. */
  size: number;
  /** The text's own line height, when its style sets one. */
  lineHeight?: number;
  /** The phone's text size (1 = the default). */
  fontScale: number;
  /** The most the number grows with the phone's text size (none: it grows all the way). */
  maxScale?: number;
  /** Apple's rolling digits can show on this phone: keep their taller line from the start. */
  apple: boolean;
}): NumberBox {
  const scale = maxScale === undefined ? fontScale : Math.min(fontScale, maxScale);
  // A roll passes through every number between: keep the wider of its two ends.
  const digits = Math.max(digitCount(value), digitCount(shown));
  const line = Math.max(lineHeight ?? 0, apple ? size * POINTS_NUMBER.lineShare : 0);
  return {
    minWidth: digits * size * scale * POINTS_NUMBER.digitWidth,
    minHeight: line * scale,
    appleSize: fontScale > 0 ? (size * scale) / fontScale : size,
  };
}
