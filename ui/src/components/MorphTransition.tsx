import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, type ViewStyle } from 'react-native';
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
import { pageMorphFrame, validMorphSource } from '@/lib/morph';
import { ALPHA, COLORS, DURATION, MOTION } from '@/constants/tokens';

type CardMorphGeometry = MorphRect & { borderRadius: number };

/**
 * Shared card-to-destination geometry. Camera drawers, workout tiles and avatars all use this
 * same UI-thread value so position, size and corner shape resolve as one physical object.
 */
export function useCardMorphStyle(
  progress: SharedValue<number>,
  progressMax: number,
  from: CardMorphGeometry,
  to: CardMorphGeometry
) {
  const reduceMotion = useReducedMotion();
  return useAnimatedStyle<ViewStyle>(() => {
    const p = reduceMotion
      ? 0
      : Math.max(0, Math.min(1, progressMax > 0 ? progress.value / progressMax : 1));
    return {
      left: from.x + (to.x - from.x) * p,
      top: from.y + (to.y - from.y) * p,
      width: from.width + (to.width - from.width) * p,
      height: from.height + (to.height - from.height) * p,
      borderRadius: from.borderRadius + (to.borderRadius - from.borderRadius) * p,
    };
  });
}

/**
 * A page growing in from a tab tap (owner, 2026-10-08, Netflix-style): the page `entering` names
 * reads the shared morph progress as its opacity, scale and corners; every other page is still.
 */
export function usePageMorphStyle(
  progress: SharedValue<number>,
  entering: SharedValue<number>,
  page: number
) {
  return useAnimatedStyle<ViewStyle>(() => {
    if (entering.value !== page) return { opacity: 1, transform: [{ scale: 1 }], borderRadius: 0 };
    const f = pageMorphFrame(progress.value);
    return { opacity: f.opacity, transform: [{ scale: f.scale }], borderRadius: f.borderRadius };
  });
}

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
  const geometryStyle = useCardMorphStyle(progress, 1, source, {
    ...target,
    borderRadius: targetRadius,
  });
  const imageStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, MOTION.morphImageUntil, 1],
      [1, 1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <Reanimated.View pointerEvents="none" style={[styles.image, geometryStyle, imageStyle]}>
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
