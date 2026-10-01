import { useCallback, useSyncExternalStore } from 'react';
import { env } from '@/lib/env';
import { posthog } from '@/lib/posthog';
import { resolveFlag, type FeatureFlag } from '@/lib/featureFlags';

/**
 * Read a PostHog feature flag as a boolean (default-on).
 *
 * Thin wrapper over the shared `posthog` singleton — no `PostHogProvider` needed,
 * consistent with how the client is used elsewhere in the app. Uses
 * `useSyncExternalStore` to subscribe to PostHog's flag source: the snapshot is
 * re-read on every render and the component re-renders whenever flags (re)load
 * (e.g. after `reloadFeatureFlagsAsync()` on sign-in). See `resolveFlag` for the
 * default-on semantics. Gate any feature in one line:
 *
 *   const showSuggestions = useFeatureFlag('follows-suggestions');
 *   if (!showSuggestions) return null;
 */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  const analyticsEnabled = env.posthogKey != null;

  // onFeatureFlags fires on every (re)load and returns its own unsubscribe.
  const subscribe = useCallback((onChange: () => void) => posthog.onFeatureFlags(onChange), []);

  const getSnapshot = useCallback(
    () => resolveFlag(posthog.isFeatureEnabled(flag), analyticsEnabled),
    [flag, analyticsEnabled]
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
