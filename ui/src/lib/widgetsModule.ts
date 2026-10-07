/**
 * The Live Activity and home-screen widget (expo-widgets), loaded only when this build has them.
 *
 * expo-widgets ships in build 13. OTA updates also reach builds 10–12, which lack it: there
 * `createWidget` / `createLiveActivity` would throw at load (the package calls
 * requireNativeModule('ExpoWidgets') at the top level), and the layouts import @expo/ui, which
 * build 10 lacks too. So nothing imports src/widgets/liveTagWidgets.tsx at the top level:
 * `loadLiveTagWidgets()` checks for both native modules first and only then requires it. iPhone
 * only (the package's Android widgets are off). No module = no Live Activity, no widget.
 * Tested in src/lib/__tests__/nativeLoaders.test.ts.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type * as LiveTagWidgets from '../widgets/liveTagWidgets';

export type LiveTagWidgetsModule = typeof LiveTagWidgets;

let nativePresent: boolean | undefined;
let loaded: LiveTagWidgetsModule | null | undefined;

function present(name: string): boolean {
  try {
    return requireOptionalNativeModule(name) != null;
  } catch {
    return false;
  }
}

/** True on an iPhone build with expo-widgets ('ExpoWidgets') and @expo/ui ('ExpoUI'). */
export function hasNativeWidgets(): boolean {
  if (nativePresent === undefined) {
    nativePresent = Platform.OS === 'ios' && present('ExpoWidgets') && present('ExpoUI');
  }
  return nativePresent;
}

/** The Mahi widget and Live Activity, or null without them. Required once, on first use. */
export function loadLiveTagWidgets(): LiveTagWidgetsModule | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeWidgets()) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../widgets/liveTagWidgets') as LiveTagWidgetsModule;
  } catch {
    loaded = null;
  }
  return loaded;
}
