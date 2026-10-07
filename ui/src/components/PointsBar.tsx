/**
 * The profile's points bar (design research, 2026-10-07): it fills toward your best each time the
 * profile opens (`replay` turning true), over MOTION.barFillMs. Reduce Motion: it fades in, full.
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, DURATION, MOTION, RADIUS } from '@/constants/tokens';

export default function PointsBar({
  progress,
  replay,
}: {
  /** How full, 0–100. */
  progress: number;
  /** The profile is on screen: each time this turns true the bar fills again. */
  replay: boolean;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(reduceMotion ? progress : 0);
  const opacity = useSharedValue(reduceMotion ? 0 : 1);
  useEffect(() => {
    if (!replay) return;
    if (reduceMotion) {
      width.value = progress;
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: DURATION.d300, reduceMotion: ReduceMotion.Never });
      return;
    }
    width.value = 0;
    width.value = withTiming(progress, {
      duration: MOTION.barFillMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [replay, progress, reduceMotion, width, opacity]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%`, opacity: opacity.value }));
  return <Reanimated.View style={[styles.fill, style]} />;
}

const styles = StyleSheet.create({
  fill: {
    height: '100%',
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
});
