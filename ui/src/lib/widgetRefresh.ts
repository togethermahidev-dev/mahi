/**
 * The widget and Live Activity, refreshed in the background (build 13+, switch
 * `widget-background-refresh`): every so often iOS wakes Mahi for a moment to read the open tags
 * and the points again, so the home-screen widget and the lock-screen tag stay right while Mahi is
 * closed (the owner-approved exception #113: this is the data the widget already keeps on the
 * phone). iOS decides when; 15 minutes is the shortest wait it allows, and it may wait longer.
 *
 * Pure: the task's name, the wait, and whether to register or unregister. The task is in
 * src/lib/widgetRefreshTask.ts. Tested in src/lib/__tests__/widgetRefresh.test.ts.
 */

export const WIDGET_REFRESH_TASK = 'mahi-widget-refresh';

/** expo-background-task's minimumInterval, in minutes: the shortest iOS allows. */
export const WIDGET_REFRESH_MINUTES = 15;

/** On launch and when the switch changes: register, unregister, or leave it. */
export function widgetRefreshAction({
  on,
  available,
  registered,
}: {
  on: boolean;
  /** This build has the background task modules and the widget. */
  available: boolean;
  registered: boolean;
}): 'register' | 'unregister' | 'none' {
  if (!available) return 'none';
  if (on) return registered ? 'none' : 'register';
  return registered ? 'unregister' : 'none';
}
