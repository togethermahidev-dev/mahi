import { Platform } from 'react-native';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { hasNativeExpoUI, loadSwiftUI } from '@/lib/expoUiModule';
import { contextMenuAvailable } from '@/lib/contextMenuPreview';

/**
 * Whether hold to preview is on here: an iPhone, the `context-menu-preview` flag (default off),
 * AND this build has @expo/ui (build 11). Off = today's behaviour exactly.
 */
export function useContextMenuPreview(): boolean {
  const flagOn = useFeatureFlag('context-menu-preview');
  return (
    contextMenuAvailable({
      platform: Platform.OS,
      nativeModulePresent: hasNativeExpoUI(),
      flagOn,
    }) && loadSwiftUI() != null
  );
}
