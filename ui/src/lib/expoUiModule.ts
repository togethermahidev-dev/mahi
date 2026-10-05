/**
 * Apple's SwiftUI views (@expo/ui), loaded only when this build has them.
 *
 * OTA updates reach every installed build with the same runtime, including build 10, which was
 * built before @expo/ui was added. Importing '@expo/ui/swift-ui' there would throw at load (its
 * modules call requireNativeModule('ExpoUI') / requireNativeView('ExpoUI', …) at the top level).
 * So nothing imports it at the top level: `loadSwiftUI()` checks for the native module first and
 * only then requires the package. iPhone only — Android never loads it. Same pattern as
 * `videoModule.ts`.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type * as SwiftUIPackage from '@expo/ui/swift-ui';
import type * as SwiftUIModifiersPackage from '@expo/ui/swift-ui/modifiers';

export type SwiftUI = typeof SwiftUIPackage;
export type SwiftUIModifiers = typeof SwiftUIModifiersPackage;

let nativePresent: boolean | undefined;
let loaded: { ui: SwiftUI; modifiers: SwiftUIModifiers } | null | undefined;

/** True on an iPhone build that has @expo/ui's native module (its native name is 'ExpoUI'). */
export function hasNativeExpoUI(): boolean {
  if (nativePresent === undefined) {
    if (Platform.OS !== 'ios') {
      nativePresent = false;
    } else {
      try {
        nativePresent = requireOptionalNativeModule('ExpoUI') != null;
      } catch {
        nativePresent = false;
      }
    }
  }
  return nativePresent;
}

/** @expo/ui's SwiftUI views and modifiers, or null without them. Required once, on first use. */
export function loadSwiftUI(): { ui: SwiftUI; modifiers: SwiftUIModifiers } | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeExpoUI()) {
    loaded = null;
    return loaded;
  }
  try {
    loaded = {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ui: require('@expo/ui/swift-ui') as SwiftUI,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      modifiers: require('@expo/ui/swift-ui/modifiers') as SwiftUIModifiers,
    };
  } catch {
    loaded = null;
  }
  return loaded;
}
