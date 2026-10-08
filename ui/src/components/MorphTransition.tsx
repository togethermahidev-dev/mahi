import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import Reanimated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { MorphRect, MorphSource } from '@/lib/morph';
import { validMorphSource } from '@/lib/morph';
import { ALPHA, COLORS, DURATION, MOTION } from '@/constants/tokens';

/**
 * Manual shared-geometry transition. Unlike Reanimated's experimental shared-element API, this
 * works across Mahi's native Modal boundary: the destination window draws a matching image at the
 * measured source rect, then moves that copy into the destination on the UI thread.
 */
export function useMorphTransition(source: MorphSource | null, onClosed: () => void) {
  const reduceMotion = useReducedMotion();
  const enabled = validMorphSource(source) && !reduceMotion;
  const progress = useSharedValue(enabled ? 0 : 1);
  const [presented, setPresented] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withSpring(1, MOTION.morph, (finished) => {
      if (finished) scheduleOnRN(setPresented, true);
    });
  }, [enabled, progress, source?.uri, source?.x, source?.y, source?.width, source?.height]);

  const close = useCallback(() => {
    if (!enabled) {
      onClosed();
      return;
    }
    setPresented(false);
    // A SharedValue is intentionally mutable: this runs on the UI thread, outside React state.
    // eslint-disable-next-line react-hooks/immutability
    progress.value = withTiming(0, { duration: DURATION.d300 }, (finished) => {
      if (finished) scheduleOnRN(onClosed);
    });
  }, [enabled, onClosed, progress]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: enabled
      ? interpolate(progress.value, [MOTION.morphContentAt, 1], [0, 1], Extrapolation.CLAMP)
      : 1,
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: enabled
      ? interpolate(progress.value, [0, 1], [0, ALPHA.a92], Extrapolation.CLAMP)
      : ALPHA.a92,
  }));

  return { enabled, progress, presented, close, contentStyle, backdropStyle };
}

export function MorphingImage({
  source,
  target,
  targetRadius,
  progress,
}: {
  source: MorphSource;
  target: MorphRect;
  targetRadius: number;
  progress: SharedValue<number>;
}): React.JSX.Element {
  const style = useAnimatedStyle(() => ({
    left: source.x + (target.x - source.x) * progress.value,
    top: source.y + (target.y - source.y) * progress.value,
    width: source.width + (target.width - source.width) * progress.value,
    height: source.height + (target.height - source.height) * progress.value,
    borderRadius: source.borderRadius + (targetRadius - source.borderRadius) * progress.value,
    opacity: interpolate(
      progress.value,
      [0, MOTION.morphImageUntil, 1],
      [1, 1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <Reanimated.View pointerEvents="none" style={[styles.image, style]}>
      <Image
        source={{ uri: source.uri, cache: 'force-cache' }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  image: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: COLORS.ink,
  },
});
