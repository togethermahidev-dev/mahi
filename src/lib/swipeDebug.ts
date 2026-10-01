import * as Updates from 'expo-updates';

/**
 * On-screen swipe diagnostics for the preview lane only (never App Store users). The page
 * swipes log what they decide at each step; SwipeDebugOverlay prints the last few lines so a
 * swipe that does nothing on a phone can be explained. Remove once the swipes are settled.
 */
export const SWIPE_DEBUG = Updates.channel === 'preview';

const MAX_LINES = 12;
let lines: string[] = [];
const listeners = new Set<() => void>();

/** Add a line (newest first). Called from gesture worklets through scheduleOnRN. */
export function swipeLog(message: string): void {
  if (!SWIPE_DEBUG) return;
  const time = new Date().toISOString().slice(17, 23);
  lines = [`${time} ${message}`, ...lines].slice(0, MAX_LINES);
  listeners.forEach((l) => l());
}

export function subscribeSwipeLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSwipeLog(): string[] {
  return lines;
}
