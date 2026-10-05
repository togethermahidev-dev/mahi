import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { loadExpoVideo, type ExpoVideo } from '@/lib/videoModule';
import { soundButtonLabel } from '@/lib/videoPosts';
import { VideoIcon, SoundOnIcon, SoundOffIcon } from '@/components/ScreenIcons';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  FONT_SIZE,
  ICON_SIZE,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

interface PostVideoProps {
  /** A signed link, or a local file right after recording. */
  uri: string;
  /** Plays, looping, while true; paused otherwise (off screen). */
  playing: boolean;
  muted: boolean;
  contentFit?: 'cover' | 'contain';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * One video shot of a post (feed, small window, post viewer, preview). Touches pass through to
 * the gestures around it (double-tap to like, tap the small window to swap, pinch in the preview).
 * On a build without the native video module (build 10 after an OTA) it shows a still card
 * instead of crashing.
 */
export default function PostVideo(props: PostVideoProps): React.JSX.Element {
  const video = loadExpoVideo();
  if (!video) return <VideoUnavailable style={props.style} />;
  return <Player video={video} {...props} />;
}

function Player({
  video,
  uri,
  playing,
  muted,
  contentFit = 'cover',
  style,
  accessibilityLabel = 'Video',
}: PostVideoProps & { video: ExpoVideo }): React.JSX.Element {
  const player = video.useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  useEffect(() => {
    // expo-video's player is a native object set by assignment (its documented API).
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);

  return (
    <View
      pointerEvents="none"
      style={style}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <video.VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
}

function VideoUnavailable({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return (
    <View
      pointerEvents="none"
      style={[styles.unavailable, style]}
      accessible
      accessibilityLabel="Video. Update Mahi to play videos."
    >
      <VideoIcon size={ICON_SIZE.i32} color={COLORS.white} />
      <Text style={styles.unavailableText}>Update Mahi to play videos</Text>
    </View>
  );
}

/** The mute / unmute button on a video. Videos start muted. */
export function SoundButton({
  muted,
  onToggle,
  style,
}: {
  muted: boolean;
  onToggle: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.sound, style, pressed && { opacity: ALPHA.a70 }]}
      hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
      accessibilityRole="button"
      accessibilityLabel={soundButtonLabel(muted)}
    >
      {muted ? (
        <SoundOffIcon size={ICON_SIZE.i20} color={COLORS.white} />
      ) : (
        <SoundOnIcon size={ICON_SIZE.i20} color={COLORS.white} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  unavailable: {
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s8,
    paddingHorizontal: SPACE.s16,
  },
  unavailableText: {
    color: withAlpha(COLORS.white, ALPHA.a80),
    fontSize: FONT_SIZE.f13,
    lineHeight: LINE_HEIGHT.l18,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  sound: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    backgroundColor: withAlpha(COLORS.black, ALPHA.a45),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
