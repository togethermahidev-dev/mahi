/**
 * Background tasks (expo-background-task + expo-task-manager), loaded only when this build has
 * them.
 *
 * They ship in build 13. OTA updates also reach builds 10 to 12, which may lack them; both
 * packages call requireNativeModule at the top level, which throws there. So nothing imports them
 * at the top level: `loadBackgroundTask()` checks for both native modules first and only then
 * requires the packages. iPhone only (they refresh the iPhone widget). Tested in
 * src/lib/__tests__/nativeLoaders.test.ts.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type * as BackgroundTaskPackage from 'expo-background-task';
import type * as TaskManagerPackage from 'expo-task-manager';

export interface BackgroundTaskSdk {
  BackgroundTask: typeof BackgroundTaskPackage;
  TaskManager: typeof TaskManagerPackage;
}

let loaded: BackgroundTaskSdk | null | undefined;

function present(name: string): boolean {
  try {
    return requireOptionalNativeModule(name) != null;
  } catch {
    return false;
  }
}

/** Both packages, or null without their native modules. Required once, on first use. */
export function loadBackgroundTask(): BackgroundTaskSdk | null {
  if (loaded !== undefined) return loaded;
  if (Platform.OS !== 'ios' || !present('ExpoBackgroundTask') || !present('ExpoTaskManager')) {
    loaded = null;
    return loaded;
  }
  try {
    loaded = {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      BackgroundTask: require('expo-background-task') as typeof BackgroundTaskPackage,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      TaskManager: require('expo-task-manager') as typeof TaskManagerPackage,
    };
  } catch {
    loaded = null;
  }
  return loaded;
}
