/**
 * Sign in with Apple (expo-apple-authentication), loaded only when this build has it.
 *
 * The package ships in build 13. OTA updates also reach builds 10 to 12, which don't have it, so
 * nothing imports it at the top level: `loadAppleAuth()` checks for the native module first and
 * only then requires the package. No module, or not an iPhone = no Apple button. Same pattern as
 * contactsModule.ts. Tested in src/lib/__tests__/nativeLoaders.test.ts.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type * as AppleAuthPackage from 'expo-apple-authentication';

export type AppleAuthSdk = typeof AppleAuthPackage;

let nativePresent: boolean | undefined;
let loaded: AppleAuthSdk | null | undefined;

/** True on an iPhone build that has expo-apple-authentication's native module. */
export function hasNativeAppleAuth(): boolean {
  if (nativePresent === undefined) {
    try {
      nativePresent =
        Platform.OS === 'ios' && requireOptionalNativeModule('ExpoAppleAuthentication') != null;
    } catch {
      nativePresent = false;
    }
  }
  return nativePresent;
}

/** expo-apple-authentication, or null without it. Required once, on first use. */
export function loadAppleAuth(): AppleAuthSdk | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeAppleAuth()) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-apple-authentication') as AppleAuthSdk;
  } catch {
    loaded = null;
  }
  return loaded;
}
