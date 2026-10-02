import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { hasNativeVideo } from '@/lib/videoModule';
import { videoAvailable } from '@/lib/videoPosts';

/**
 * Whether video posts are on here: the `video-posts` flag (default off) AND this build has the
 * native video module. Off = today's photo-only camera, and the microphone is never asked for.
 */
export function useVideoPosts(): boolean {
  return videoAvailable(useFeatureFlag('video-posts'), hasNativeVideo());
}
