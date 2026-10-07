/**
 * The share extension's native side (expo-share-intent), looked up only when this build has it.
 *
 * It ships in build 13. OTA updates also reach builds 10 to 12, which don't have it, so the
 * package itself is never imported (its hook also pulls in expo-linking): the native module is
 * read directly with `requireOptionalNativeModule` (null instead of a throw). No module = Mahi
 * isn't in the share sheet, and nothing here runs. iPhone only. Rules in src/lib/sharedPhoto.ts;
 * wiring in src/hooks/useSharedPhotos.ts. Tested in src/lib/__tests__/nativeLoaders.test.ts.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export interface ShareIntentNative {
  /** Reads what the extension saved for this link; the answer comes as an `onChange` event. */
  getShareIntent(url: string): Promise<void>;
  /** Forgets the App Group entry. */
  clearShareIntent(key: string): void;
  addListener(event: 'onChange', listener: (e: { value: unknown }) => void): { remove(): void };
}

let nativeModule: ShareIntentNative | null | undefined;

/** The native module, or null without it (builds 10–12, Android). Looked up once. */
export function loadShareIntent(): ShareIntentNative | null {
  if (nativeModule === undefined) {
    try {
      nativeModule =
        Platform.OS === 'ios'
          ? requireOptionalNativeModule<ShareIntentNative>('ExpoShareIntentModule')
          : null;
    } catch {
      nativeModule = null;
    }
  }
  return nativeModule;
}
