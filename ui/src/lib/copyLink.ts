/**
 * Copy link, for the share sheet.
 *
 * React Native 0.86 still ships its own clipboard module (native name `Clipboard`), and it is in
 * every build Mahi has out. It is deprecated: React Native says it "has been extracted from
 * react-native core and will be removed in a future release". Build 14 swaps in expo-clipboard
 * here, in this one file (decision #180); nothing else knows how a link is copied.
 *
 * OTA updates reach builds that may not have a module, so nothing imports `Clipboard` from
 * 'react-native' (its JS wrapper uses `getEnforcing`, which throws when the module is missing):
 * `TurboModuleRegistry.get` is asked first (null instead of throwing). No module = no Copy link
 * button. Same pattern as screensModule.ts. Tested in src/lib/__tests__/copyLink.test.ts.
 */
import { TurboModuleRegistry, type TurboModule } from 'react-native';

/** The module React Native registers natively (RCTClipboard / ClipboardModule). */
const NATIVE_NAME = 'Clipboard';

interface ClipboardModule extends TurboModule {
  setString: (content: string) => void;
}

let clipboard: ClipboardModule | null | undefined;

function nativeClipboard(): ClipboardModule | null {
  if (clipboard === undefined) {
    try {
      clipboard = TurboModuleRegistry.get<ClipboardModule>(NATIVE_NAME) ?? null;
    } catch {
      clipboard = null;
    }
  }
  return clipboard;
}

/** True on a build that can copy: the share sheet shows Copy link only then. */
export function canCopyLink(): boolean {
  return nativeClipboard() != null;
}

/** Put a link on the phone's clipboard. False when it couldn't (no module, or the phone refused). */
export function copyLink(url: string): boolean {
  const native = nativeClipboard();
  if (!native) return false;
  try {
    native.setString(url);
    return true;
  } catch {
    return false;
  }
}
