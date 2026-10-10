/**
 * "Answered @sam" pressed onto the photo as an answer is posted (design research, 2026-10-07):
 * it lands from a little larger, tilted, in the accent colour, and stays while the photo lifts
 * away. Words: `answeredStamp` (src/lib/answerStamp.ts). Reduce Motion: it fades in, untilted.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { TYPOGRAPHY } from '@/constants/typography';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  DURATION,
  MOTION,
  RADIUS,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

export default function AnswerStamp({ text }: { text: string }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : MOTION.stampFromScale);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, {
      duration: reduceMotion ? DURATION.d200 : DURATION.d100,
      reduceMotion: ReduceMotion.Never,
    });
    if (!reduceMotion) scale.value = withSpring(1, MOTION.morph);
  }, [reduceMotion, opacity, scale]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${reduceMotion ? 0 : MOTION.stampTiltDeg}deg` }],
  }));
  return (
    <View style={styles.spot} pointerEvents="none">
      <Reanimated.View
        style={[styles.stamp, style]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={text}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.text}>{text}</Text>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  spot: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    borderWidth: BORDER_WIDTH.w2,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.r12,
    paddingVertical: SPACE.s10,
    paddingHorizontal: SPACE.s20,
    backgroundColor: withAlpha(COLORS.black, ALPHA.a35),
  },
  text: {
    ...TYPOGRAPHY.h1,
    color: COLORS.accent,
  },
});
