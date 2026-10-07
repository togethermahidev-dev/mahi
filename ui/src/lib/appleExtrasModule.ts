/**
 * Mahi's iPhone extras (the local module ui/modules/mahi-apple-extras), looked up only when this
 * build has it.
 *
 * The module ships in build 13. OTA updates also reach builds 10 to 12, which don't have it, so
 * nothing here touches it until `requireOptionalNativeModule('MahiAppleExtras')` (null instead of
 * a throw) says it's there. No module = none of the build 13 extras; the app works as before.
 * iPhone only. Rules in src/lib/appActions.ts. Tested in src/lib/__tests__/nativeLoaders.test.ts.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export interface AppleExtrasNative {
  /** Writes `switch.<flag>` = true / false to the App Group and reloads the controls. */
  setSwitches(values: Record<string, boolean>): void;
  /** The link an intent left in the App Group, once, or null. */
  takePendingLink(): string | null;
  /** Puts Mahi's own actions in Spotlight (replacing any there before). */
  setSpotlightActions(
    actions: readonly { link: string; title: string; detail: string; keywords: string[] }[]
  ): Promise<void>;
  /** Takes Mahi's actions out of Spotlight. */
  clearSpotlightActions(): Promise<void>;
  /** An intent just left a link. */
  addListener(event: 'onPendingLink', listener: () => void): { remove(): void };
}

let nativeModule: AppleExtrasNative | null | undefined;

/** The native module, or null without it (builds 10–12, Android). Looked up once. */
export function loadAppleExtras(): AppleExtrasNative | null {
  if (nativeModule === undefined) {
    try {
      nativeModule =
        Platform.OS === 'ios'
          ? requireOptionalNativeModule<AppleExtrasNative>('MahiAppleExtras')
          : null;
    } catch {
      nativeModule = null;
    }
  }
  return nativeModule;
}
