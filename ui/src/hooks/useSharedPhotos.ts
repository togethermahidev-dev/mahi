import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { loadShareIntent } from '@/lib/shareIntentModule';
import {
  SHARE_KEY,
  isShareLink,
  sharedFilePaths,
  sharedPhotoProblem,
  sharedPhotos,
} from '@/lib/sharedPhoto';
import { reportError } from '@/lib/sentry';
import { useCameraRequestStore } from '@/store/cameraRequestStore';
import { useToastStore } from '@/store/toastStore';

/** Deletes the share extension's copies; a file already gone is fine. */
export function deleteSharedFiles(uris: string[]): void {
  for (const uri of uris) {
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

/**
 * Photos shared from Photos to Mahi (build 13+, switch `share-to-mahi`): opens the Camera page with
 * them as the shots (CameraScreen takes the request). Off: the share is ignored — the copies are
 * deleted, the App Group entry cleared, and Mahi simply opens as it is. Does nothing on builds
 * without the share extension. Mounted once, beside the push routing.
 */
export function useSharedPhotos(openCamera: () => void): void {
  const on = useFeatureFlag('share-to-mahi');
  const onRef = useRef(on);
  const openRef = useRef(openCamera);
  useEffect(() => {
    onRef.current = on;
    openRef.current = openCamera;
  });

  useEffect(() => {
    const share = loadShareIntent();
    if (!share) return;
    const changed = share.addListener('onChange', ({ value }) => {
      share.clearShareIntent(SHARE_KEY);
      const verdict = sharedPhotos(value);
      if (!onRef.current || !verdict.ok) {
        deleteSharedFiles(sharedFilePaths(value));
        const problem = onRef.current && !verdict.ok ? sharedPhotoProblem(verdict.reason) : null;
        if (problem) useToastStore.getState().show(problem);
        return;
      }
      useCameraRequestStore.getState().ask({ kind: 'shared-photos', photos: verdict.photos });
      openRef.current();
    });
    const take = (url: string | null) => {
      if (!isShareLink(url)) return;
      share
        .getShareIntent(url as string)
        .catch((err) => reportError(err, { flow: 'camera', action: 'getShareIntent' }));
    };
    Linking.getInitialURL()
      .then(take)
      .catch(() => {});
    const opened = Linking.addEventListener('url', ({ url }) => take(url));
    return () => {
      changed.remove();
      opened.remove();
    };
  }, []);
}
