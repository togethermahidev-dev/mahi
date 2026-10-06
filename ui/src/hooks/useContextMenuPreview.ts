import { Platform } from 'react-native';
import { hasNativeExpoUI, loadSwiftUI } from '@/lib/expoUiModule';
import { contextMenuAvailable } from '@/lib/contextMenuPreview';

/**
 * Whether hold to preview works here: an iPhone whose build has @expo/ui (build 11+). Standard for
 * everyone since 2026-10-06 (owner): no switch. Elsewhere hold to view stays as before.
 */
export function useContextMenuPreview(): boolean {
  return (
    contextMenuAvailable({
      platform: Platform.OS,
      nativeModulePresent: hasNativeExpoUI(),
      flagOn: true,
    }) && loadSwiftUI() != null
  );
}
