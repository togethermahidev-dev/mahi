/**
 * Reads the App Clip's hand-over from the shared App Group, through ExtensionStorage (the native
 * module @bacons/apple-targets brings in build 13). OTA updates also reach builds 10–12, which
 * don't have it: there `requireOptionalNativeModule` gives null and nothing is read. iPhone only.
 * What the value means: clipHandover.ts. Tested in src/lib/__tests__/clipHandoverModule.test.ts.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { CLIP_APP_GROUP, CLIP_HANDOVER_KEY } from './clipHandover';

type ExtensionStorageNative = {
  get: (key: string, group: string) => string | null | undefined;
  remove: (key: string, group: string) => void;
};

function storage(): ExtensionStorageNative | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireOptionalNativeModule<ExtensionStorageNative>('ExtensionStorage');
  } catch {
    return null;
  }
}

/** True on an iPhone build that can read the App Group (build 13+). */
export function hasClipHandover(): boolean {
  return storage() != null;
}

/** What the clip saved, deleted as it's read so it's used once; null when nothing was saved. */
export function takeClipHandover(): string | null {
  const native = storage();
  if (!native) return null;
  try {
    const raw = native.get(CLIP_HANDOVER_KEY, CLIP_APP_GROUP) ?? null;
    native.remove(CLIP_HANDOVER_KEY, CLIP_APP_GROUP);
    return raw;
  } catch {
    return null;
  }
}
