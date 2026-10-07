import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { SPOTLIGHT_ACTIONS, appGroupSwitchValues } from '@/lib/appActions';
import { loadAppleExtras } from '@/lib/appleExtrasModule';
import { isFlagOn, useFeatureFlag } from '@/hooks/useFeatureFlag';
import { posthog } from '@/lib/posthog';
import { reportError } from '@/lib/sentry';

/**
 * Keeps Mahi's iPhone extras in step with their kill switches (build 13+): writes each switch the
 * Swift side reads to the App Group (the Control Centre button says "Open Mahi" when its switch is
 * off), again whenever flags reload; and puts Mahi's own actions in Spotlight, or takes them out
 * when `spotlight` is off. Does nothing on builds without the module. Mounted once, in App.tsx,
 * signed in or not.
 */
export function useAppleExtras(): void {
  const subscribe = useCallback((onChange: () => void) => posthog.onFeatureFlags(onChange), []);
  const switches = useSyncExternalStore(subscribe, () =>
    JSON.stringify(appGroupSwitchValues(isFlagOn))
  );
  const spotlightOn = useFeatureFlag('spotlight');

  useEffect(() => {
    const extras = loadAppleExtras();
    if (!extras) return;
    try {
      extras.setSwitches(JSON.parse(switches) as Record<string, boolean>);
    } catch (err) {
      reportError(err, { flow: 'flags', action: 'appGroupSwitches', level: 'warning' });
    }
  }, [switches]);

  useEffect(() => {
    const extras = loadAppleExtras();
    if (!extras) return;
    (spotlightOn
      ? extras.setSpotlightActions(SPOTLIGHT_ACTIONS)
      : extras.clearSpotlightActions()
    ).catch((err) =>
      reportError(err, { flow: 'startup', action: 'spotlightActions', level: 'warning' })
    );
  }, [spotlightOn]);
}
