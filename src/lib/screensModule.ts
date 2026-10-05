/**
 * react-native-screens (Apple's native tab bar), loaded only when this build has it.
 *
 * OTA updates reach every installed build with the same runtime, including build 10, which was
 * built without react-native-screens. Its native views don't exist there, so drawing them would
 * crash. So nothing imports it at the top level: `loadScreens()` asks
 * `TurboModuleRegistry.get('RNSModule')` first (null instead of throwing) and only then requires
 * the package. No module = the swipe pages, as before (`nativeTabsAvailable`).
 * Tested in src/lib/__tests__/nativeLoaders.test.ts.
 */
import { TurboModuleRegistry } from 'react-native';
import type * as ScreensPackage from 'react-native-screens';

export type Screens = typeof ScreensPackage;

/** The module the package registers natively (its ios/RNSModule.mm). */
const NATIVE_NAME = 'RNSModule';

let nativePresent: boolean | undefined;
let loaded: Screens | null | undefined;

/** True when this build has react-native-screens' native side. */
export function hasNativeScreens(): boolean {
  if (nativePresent === undefined) {
    try {
      nativePresent = TurboModuleRegistry.get(NATIVE_NAME) != null;
    } catch {
      nativePresent = false;
    }
  }
  return nativePresent;
}

/** react-native-screens, or null on a build without it. Required once, on first use. */
export function loadScreens(): Screens | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeScreens()) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('react-native-screens') as Screens;
  } catch {
    loaded = null;
  }
  return loaded;
}
