import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { CameraIcon, ProfileIcon } from '@/components/ScreenIcons';
import PostVideo from '@/components/PostVideo';
import type { PipGuide } from '@/lib/captureGuide';
import { TYPOGRAPHY } from '@/constants/typography';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  ELEVATION,
  ICON_SIZE,
  RADIUS,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/**
 * The small window on the live camera, in the preview's photo-in-photo spot, so people know two
 * photos are taken: first it says what comes second, then it shows the photo just taken.
 * Touches pass straight through to the camera controls under it. The camera is always dark.
 */
export default function CapturePipGuide({
  guide,
  photoUri,
  photoIsVideo = false,
  frame,
}: {
  guide: PipGuide;
  photoUri: string | null;
  /** The first shot was a video (video posts): it plays here, muted. */
  photoIsVideo?: boolean;
  frame: { left: number; top: number; width: number; height: number };
}) {
  return (
    <View pointerEvents="none" style={[styles.box, frame]}>
      {guide.kind === 'photo' && photoUri && photoIsVideo ? (
        <PostVideo
          uri={photoUri}
          playing
          muted
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Your first video"
        />
      ) : guide.kind === 'photo' && photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : guide.kind === 'next' ? (
        <View style={styles.placeholder}>
          {guide.next === 'selfie' ? (
            <ProfileIcon size={ICON_SIZE.i32} color={COLORS.white} />
          ) : (
            <CameraIcon size={ICON_SIZE.i32} color={COLORS.white} />
          )}
          <Text style={styles.text}>{guide.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderRadius: RADIUS.r12,
    overflow: 'hidden',
    borderWidth: BORDER_WIDTH.w2,
    borderColor: withAlpha(COLORS.white, ALPHA.a60),
    backgroundColor: withAlpha(COLORS.black, ALPHA.a35),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: SIZE.z4 },
    shadowOpacity: ALPHA.a40,
    shadowRadius: SHADOW_BLUR.b8,
    elevation: ELEVATION.e8,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s8,
    paddingHorizontal: SPACE.s8,
  },
  text: {
    ...TYPOGRAPHY.labelStrong,
    color: COLORS.white,
    textAlign: 'center',
  },
});
