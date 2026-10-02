/**
 * The square that marks where a tap focused the live camera (flag `camera-tap-focus`). It lands a
 * little big, settles, waits and fades. With Reduce Motion it only appears and fades.
 * Touches pass straight through it; VoiceOver skips it (it only echoes the tap).
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BORDER_WIDTH, CAMERA, COLORS, SIZE } from '@/constants/tokens';

/** The square's side; the camera centres it on the tap with this. */
export const FOCUS_SQUARE_SIZE = SIZE.z72;

/** One tap: where the square's top-left goes, and an id so a tap on the same spot replays it. */
export type FocusTap = { left: number; top: number; id: number };

export default function FocusSquare({ tap }: { tap: FocusTap | null }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!tap) return;
    // A fade is fine with Reduce Motion, so it always runs; only the zoom-in is left out.
    const never = ReduceMotion.Never;
    scale.value = reduceMotion
      ? 1
      : withSequence(
          never,
          withTiming(CAMERA.focusStartScale, { duration: 0, reduceMotion: never }),
          withTiming(1, {
            duration: CAMERA.focusSettleMs,
            easing: Easing.out(Easing.cubic),
            reduceMotion: never,
          })
        );
    opacity.value = withSequence(
      never,
      withTiming(1, { duration: 0, reduceMotion: never }),
      withDelay(
        CAMERA.focusSettleMs + CAMERA.focusHoldMs,
        withTiming(0, { duration: CAMERA.focusFadeMs, reduceMotion: never }),
        never
      )
    );
  }, [tap, reduceMotion, scale, opacity]);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!tap) return null;
  return (
    <Reanimated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.square, { left: tap.left, top: tap.top }, animated]}
    />
  );
}

const styles = StyleSheet.create({
  square: {
    position: 'absolute',
    width: FOCUS_SQUARE_SIZE,
    height: FOCUS_SQUARE_SIZE,
    borderWidth: BORDER_WIDTH.w1_5,
    borderColor: COLORS.gold,
  },
});
