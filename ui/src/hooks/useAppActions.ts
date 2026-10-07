import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { appActionToRun } from '@/lib/appActions';
import { loadAppleExtras } from '@/lib/appleExtrasModule';
import { isFlagOn } from '@/hooks/useFeatureFlag';
import { reportError } from '@/lib/sentry';

export interface AppActionRoutes {
  openCamera: () => void;
}

/**
 * Runs what Mahi's iPhone extras asked for (build 13+): the Control Centre / lock screen button
 * leaves a link in the App Group and opens Mahi; this takes it when Mahi opens or comes back, or
 * at once when the intent says so, and runs it if that extra's switch is on (src/lib/appActions.ts).
 * Does nothing on builds without the module. Mounted once, beside the push routing.
 */
export function useAppActions(routes: AppActionRoutes): void {
  const routesRef = useRef(routes);
  useEffect(() => {
    routesRef.current = routes;
  });

  useEffect(() => {
    const extras = loadAppleExtras();
    if (!extras) return;
    const takePending = () => {
      let link: string | null = null;
      try {
        link = extras.takePendingLink();
      } catch (err) {
        reportError(err, { flow: 'startup', action: 'takePendingLink', level: 'warning' });
      }
      const action = appActionToRun(link, isFlagOn);
      if (action === 'camera') routesRef.current.openCamera();
    };
    takePending();
    const left = extras.addListener('onPendingLink', takePending);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') takePending();
    });
    return () => {
      left.remove();
      foreground.remove();
    };
  }, []);
}
