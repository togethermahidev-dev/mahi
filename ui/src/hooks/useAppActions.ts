import { useEffect, useRef } from 'react';
import { AppState, Linking } from 'react-native';
import { appActionToRun, type AppAction } from '@/lib/appActions';
import { loadAppleExtras } from '@/lib/appleExtrasModule';
import { isFlagOn } from '@/hooks/useFeatureFlag';
import { reportError } from '@/lib/sentry';

export type AppActionRoutes = Record<AppAction, () => void>;

/**
 * Runs what Mahi's iPhone extras asked for (build 13+): the Control Centre button and Spotlight's
 * items leave a link in the App Group and open Mahi; this takes it when Mahi opens or comes back,
 * or at once when told, and runs it if that extra's switch is on (src/lib/appActions.ts). Also the
 * plain links `mahi://invites` and `mahi://find-mates` (`mahi://camera` is usePushRouting's).
 * Mounted once, beside the push routing.
 */
export function useAppActions(routes: AppActionRoutes): void {
  const routesRef = useRef(routes);
  useEffect(() => {
    routesRef.current = routes;
  });

  useEffect(() => {
    const run = (link: string | null) => {
      const action = appActionToRun(link, isFlagOn);
      if (action) routesRef.current[action]();
    };

    // Plain links (not the camera: the push routing opens that one already).
    const opened = (url: string | null) => {
      if (appActionToRun(url, isFlagOn) !== 'camera') run(url);
    };
    Linking.getInitialURL()
      .then(opened)
      .catch(() => {});
    const linked = Linking.addEventListener('url', ({ url }) => opened(url));

    const extras = loadAppleExtras();
    if (!extras) return () => linked.remove();
    const takePending = () => {
      let link: string | null = null;
      try {
        link = extras.takePendingLink();
      } catch (err) {
        reportError(err, { flow: 'startup', action: 'takePendingLink', level: 'warning' });
      }
      run(link);
    };
    takePending();
    const left = extras.addListener('onPendingLink', takePending);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') takePending();
    });
    return () => {
      linked.remove();
      left.remove();
      foreground.remove();
    };
  }, []);
}
