/**
 * Apple's icon view (expo-symbols), loaded only when this build has it.
 *
 * OTA updates reach every installed build with the same runtime, including build 10, which was
 * built before expo-symbols was added. Its view file calls requireNativeViewManager('SymbolModule')
 * at load, so nothing imports it at the top level: `loadExpoSymbols()` checks for the native module
 * first and only then requires the package. Same pattern as src/lib/videoModule.ts.
 */
import { requireOptionalNativeModule } from 'expo';
import type * as ExpoSymbolsPackage from 'expo-symbols';

export type ExpoSymbols = typeof ExpoSymbolsPackage;

let nativePresent: boolean | undefined;
let loaded: ExpoSymbols | null | undefined;

/** True when this build has expo-symbols' native module (the native name is 'SymbolModule'). */
export function hasNativeSymbols(): boolean {
  if (nativePresent === undefined) {
    try {
      nativePresent = requireOptionalNativeModule('SymbolModule') != null;
    } catch {
      nativePresent = false;
    }
  }
  return nativePresent;
}

/** expo-symbols, or null on a build without it. Required once, on first use. */
export function loadExpoSymbols(): ExpoSymbols | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeSymbols()) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-symbols') as ExpoSymbols;
  } catch {
    loaded = null;
  }
  return loaded;
}
