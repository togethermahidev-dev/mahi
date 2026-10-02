/**
 * The native video player (expo-video), loaded only when this build has it.
 *
 * OTA updates reach every installed build with the same runtime (0.1.0), including build 10,
 * which was built before expo-video was added. Importing expo-video there would throw at load
 * (its module calls requireNativeModule('ExpoVideo')). So nothing imports it at the top level:
 * `loadExpoVideo()` checks for the native module first and only then requires the package.
 * No native module = video posts off (see `videoAvailable` in videoPosts.ts).
 */
import { requireOptionalNativeModule } from 'expo';
import type * as ExpoVideoPackage from 'expo-video';

export type ExpoVideo = typeof ExpoVideoPackage;

let nativePresent: boolean | undefined;
let loaded: ExpoVideo | null | undefined;

/** True when this build has expo-video's native module (the native name is 'ExpoVideo'). */
export function hasNativeVideo(): boolean {
  if (nativePresent === undefined) {
    try {
      nativePresent = requireOptionalNativeModule('ExpoVideo') != null;
    } catch {
      nativePresent = false;
    }
  }
  return nativePresent;
}

/** expo-video, or null on a build without it. Required once, on first use. */
export function loadExpoVideo(): ExpoVideo | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeVideo()) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-video') as ExpoVideo;
  } catch {
    loaded = null;
  }
  return loaded;
}
