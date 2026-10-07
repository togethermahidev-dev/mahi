/**
 * The background refresh of the widget and Live Activity (build 13+, switch
 * `widget-background-refresh`; rules in src/lib/widgetRefresh.ts).
 *
 * `defineWidgetRefreshTask()` runs at the top of index.ts: iOS may start Mahi in the background
 * just to run the task, and the task must be defined before anything else. `useWidgetRefresh()`
 * (App.tsx) registers it on launch and unregisters it when the switch is off. Builds without the
 * modules or the widget do nothing.
 */
import { useEffect } from 'react';
import { loadBackgroundTask } from './backgroundTaskModule';
import { loadLiveTagWidgets } from './widgetsModule';
import { WIDGET_REFRESH_MINUTES, WIDGET_REFRESH_TASK, widgetRefreshAction } from './widgetRefresh';
import { supabase } from './supabase';
import { reportError } from './sentry';
import { getProfile } from '@/api';
import { isFlagOn, useFeatureFlag } from '@/hooks/useFeatureFlag';
import { syncLiveTag } from '@/hooks/useLiveTag';
import { useAuthStore, useTagStore, useUserStore } from '@/store';

/** Reads the open tags and the points again and brings the widget and Live Activity up to date. */
async function refreshWidget(): Promise<void> {
  if (!isFlagOn('widget-background-refresh') || !loadLiveTagWidgets()) return;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  // Signed out: nothing to read; the widget already shows nothing personal.
  if (!session) return;
  if (!useAuthStore.getState().user) useAuthStore.getState().setSession(session);
  const [profile] = await Promise.all([
    getProfile(session.user.id),
    useTagStore.getState().syncOpenTags(),
  ]);
  if (profile.error) throw profile.error;
  if (profile.data) useUserStore.getState().setProfile(profile.data);
  // A failed read has already been reported by the tag store; keep what the widget shows.
  if (useTagStore.getState().openTagsError) return;
  syncLiveTag(true);
}

/** Defines the task, once, at startup. */
export function defineWidgetRefreshTask(): void {
  const sdk = loadBackgroundTask();
  if (!sdk) return;
  const { BackgroundTaskResult } = sdk.BackgroundTask;
  try {
    sdk.TaskManager.defineTask(WIDGET_REFRESH_TASK, async () => {
      try {
        await refreshWidget();
        return BackgroundTaskResult.Success;
      } catch (err) {
        reportError(err, { flow: 'tags', action: 'widgetBackgroundRefresh', level: 'warning' });
        return BackgroundTaskResult.Failed;
      }
    });
  } catch (err) {
    reportError(err, { flow: 'startup', action: 'defineWidgetRefreshTask', level: 'warning' });
  }
}

/** Registers the task on launch while the switch is on; unregisters it when it's off. */
export function useWidgetRefresh(): void {
  const on = useFeatureFlag('widget-background-refresh');

  useEffect(() => {
    const sdk = loadBackgroundTask();
    const available = sdk != null && loadLiveTagWidgets() != null;
    if (!sdk || !available) return;
    let live = true;
    sdk.TaskManager.isTaskRegisteredAsync(WIDGET_REFRESH_TASK)
      .then((registered) => {
        if (!live) return;
        const action = widgetRefreshAction({ on, available, registered });
        if (action === 'register') {
          return sdk.BackgroundTask.registerTaskAsync(WIDGET_REFRESH_TASK, {
            minimumInterval: WIDGET_REFRESH_MINUTES,
          });
        }
        if (action === 'unregister') {
          return sdk.BackgroundTask.unregisterTaskAsync(WIDGET_REFRESH_TASK);
        }
      })
      .catch((err) =>
        reportError(err, { flow: 'tags', action: 'widgetRefreshRegister', level: 'warning' })
      );
    return () => {
      live = false;
    };
  }, [on]);
}
