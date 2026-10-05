/**
 * Didit's native identity check (@didit-protocol/sdk-react-native), loaded only when this build
 * has it.
 *
 * OTA updates reach every installed build with the same runtime, including build 10, which was
 * built without Didit. The package's native spec calls
 * `TurboModuleRegistry.getEnforcing('SdkReactNative')` when it loads, which throws on a build
 * without the module. So nothing imports it at the top level: `loadDidit()` asks
 * `TurboModuleRegistry.get('SdkReactNative')` first (returns null instead of throwing) and only
 * then requires the package. No module = identity checks off (`identityCheckAvailable`).
 * Tested in src/lib/__tests__/nativeLoaders.test.ts.
 */
import { TurboModuleRegistry } from 'react-native';
import type * as DiditPackage from '@didit-protocol/sdk-react-native';

export type DiditSdk = typeof DiditPackage;

/** The TurboModule name the package registers (its src/NativeSdkReactNative.ts). */
const NATIVE_NAME = 'SdkReactNative';

let nativePresent: boolean | undefined;
let loaded: DiditSdk | null | undefined;

/** True when this build has Didit's native module. */
export function hasNativeDidit(): boolean {
  if (nativePresent === undefined) {
    try {
      nativePresent = TurboModuleRegistry.get(NATIVE_NAME) != null;
    } catch {
      nativePresent = false;
    }
  }
  return nativePresent;
}

/** The Didit SDK, or null on a build without it. Required once, on first use. */
export function loadDidit(): DiditSdk | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeDidit()) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('@didit-protocol/sdk-react-native') as DiditSdk;
  } catch {
    loaded = null;
  }
  return loaded;
}
