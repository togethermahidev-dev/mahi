import * as Updates from 'expo-updates';
import { posthog } from '@/lib/posthog';

/**
 * Swipe diagnostics for the preview lane only (never App Store users). The page swipes report
 * what they decide at each step as a `swipe_debug` PostHog event, so a swipe that does nothing
 * on a phone can be explained without anything on screen. Remove once the swipes are settled.
 */
export const SWIPE_DEBUG = Updates.channel === 'preview';

/** Called from gesture worklets through scheduleOnRN. */
export function swipeLog(message: string): void {
  if (!SWIPE_DEBUG) return;
  posthog.capture('swipe_debug', { message, at: Date.now() });
}
