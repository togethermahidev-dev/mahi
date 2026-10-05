import { WAIT } from '@/constants/tokens';

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
