import { LAYOUT, WAIT } from '@/constants/tokens';

/** The words a toast holds before each extra second starts counting. */
const FREE_WORDS = 6;
/** Extra words that earn one more step of `WAIT.toastPerFiveWords`. */
const WORDS_PER_STEP = 5;

/**
 * How long a toast stays: long enough to read. The least for up to 6 words, a second more for
 * each 5 words past that, never longer than the most; one with a button stays long enough to
 * reach it.
 */
export function toastDuration(message: string, hasAction: boolean): number {
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  const extra = Math.ceil(Math.max(0, words - FREE_WORDS) / WORDS_PER_STEP);
  const byLength = Math.min(WAIT.toastMax, WAIT.toastMin + extra * WAIT.toastPerFiveWords);
  return hasAction ? Math.max(byLength, WAIT.toastAction) : byLength;
}

/**
 * How many lines a toast wraps to: 3 normally; more at large text (`fontScale` is the phone's text
 * size, 1 = default), so it isn't cut off mid-sentence. It grows away from the controls it sits
 * above, and still stops short of filling the screen.
 */
export function toastLines(fontScale: number): number {
  return fontScale >= LAYOUT.largeTextScale ? LAYOUT.toastLinesLarge : LAYOUT.toastLines;
}
