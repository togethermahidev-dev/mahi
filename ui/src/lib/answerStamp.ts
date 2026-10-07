/**
 * Answering a tag (design research, 2026-10-07): an "Answered @sam" stamp presses onto the photo
 * as Post is confirmed, then the photo lifts away; on the camera the tag pill turns into a tick
 * with the same words. Pure and unit-tested; the views are DualPhotoPreview in CameraScreen.tsx
 * and OpenTagsBanner.tsx.
 */

/** "Answered @sam", "Answered @sam and 2 more"; null for a post that answers no tag. */
export function answeredStamp(usernames: string[]): string | null {
  if (usernames.length === 0) return null;
  const others = usernames.length - 1;
  return `Answered @${usernames[0]}${others > 0 ? ` and ${others} more` : ''}`;
}

/**
 * How the tag pill becomes the tick: Apple's Liquid Glass morph (iOS 26, a build with @expo/ui),
 * our spring elsewhere, a plain fade with Reduce Motion.
 */
export function answeredMorph({
  glass,
  expoUiPresent,
  reduceMotion,
}: {
  glass: boolean;
  expoUiPresent: boolean;
  reduceMotion: boolean;
}): 'glass' | 'spring' | 'fade' {
  if (reduceMotion) return 'fade';
  return glass && expoUiPresent ? 'glass' : 'spring';
}
