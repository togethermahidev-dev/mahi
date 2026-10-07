import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { usePop } from '@/components/Motion';
import { haptic } from '@/lib/haptics';
import { track } from '@/lib/analytics';
import { themeColors } from '@/lib/themeColors';
import {
  circleFeedback,
  mateCircles,
  mateCirclesTitle,
  type CircleMate,
  type MateCircle,
} from '@/lib/mateCircles';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  DURATION,
  FONT_SIZE,
  LINE_HEIGHT,
  MOTION,
  OFFSET,
  RADIUS,
  SCALE,
  SIZE,
  SPACE,
} from '@/constants/tokens';

/**
 * The mate circles (owner, 2026-10-07, after Lapse): one big circle per mate a post needs. An empty
 * circle is a dashed accent ring with a "+"; tagging a friend or adding a link morphs the next one
 * into their photo (or initial), or the link's number on an accent fill, with a small check. Tap a
 * filled circle to empty it. When the last one fills, the row pulses and the title names who will
 * keep you going. Reduce Motion: fades only. Words and order: src/lib/mateCircles.ts.
 */
export default function MateCircles({
  total,
  friends,
  links,
  dark,
  compact = false,
  onAdd,
  onRemove,
}: {
  total: number;
  friends: CircleMate[];
  links: number;
  dark: boolean;
  /** No title and no names under the circles (an empty state's picture). */
  compact?: boolean;
  /** An empty circle was tapped. */
  onAdd?: () => void;
  /** A filled circle was tapped: take that friend or link off. */
  onRemove?: (circle: MateCircle) => void;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const colors = themeColors(dark);
  const picks = { total, friends, links };
  const circles = mateCircles(picks);
  const title = mateCirclesTitle(picks);

  // Felt and counted once per change; a sheet opening with circles already filled is not felt.
  const prev = useRef<MateCircle[] | null>(null);
  const [fullCount, setFullCount] = useState(0);
  const signature = circles.map((c) => c.key).join('|');
  useEffect(() => {
    const feedback = circleFeedback(prev.current, circles);
    prev.current = circles;
    if (feedback.haptic) haptic(feedback.haptic);
    for (const f of feedback.filled) track('mate_circle_filled', f);
    if (feedback.full && feedback.filled.length > 0) setFullCount((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  const pulse = usePop(fullCount);

  return (
    <View style={styles.wrap}>
      {compact ? null : (
        <Reanimated.Text
          key={title}
          entering={FadeIn.duration(DURATION.d200).reduceMotion(ReduceMotion.Never)}
          style={[styles.title, { color: colors.text }]}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          {title}
        </Reanimated.Text>
      )}
      <Reanimated.View style={[styles.row, pulse]}>
        {circles.map((circle) => (
          <Circle
            key={circle.index}
            circle={circle}
            dark={dark}
            compact={compact}
            reduceMotion={reduceMotion}
            onPress={
              circle.kind === 'empty' ? onAdd : onRemove ? () => onRemove(circle) : undefined
            }
          />
        ))}
      </Reanimated.View>
    </View>
  );
}

function Circle({
  circle,
  dark,
  compact,
  reduceMotion,
  onPress,
}: {
  circle: MateCircle;
  dark: boolean;
  compact: boolean;
  reduceMotion: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const colors = themeColors(dark);
  const filled = circle.kind !== 'empty';
  // While a circle empties, it keeps showing who was in it as it fades.
  const [face, setFace] = useState(circle);
  if (filled && face.key !== circle.key) setFace(circle);

  const fill = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    fill.value = reduceMotion
      ? withTiming(filled ? 1 : 0, { duration: DURATION.d200 })
      : withSpring(filled ? 1 : 0, MOTION.morph);
  }, [filled, reduceMotion, fill]);

  const emptyStyle = useAnimatedStyle(() => {
    const f = Math.min(1, Math.max(0, fill.value));
    return reduceMotion
      ? { opacity: 1 - f }
      : { opacity: 1 - f, transform: [{ scale: 1 - f * (1 - SCALE.s0_68) }] };
  });
  const filledStyle = useAnimatedStyle(() => {
    const opacity = Math.min(1, Math.max(0, fill.value));
    return reduceMotion
      ? { opacity }
      : { opacity, transform: [{ scale: SCALE.s0_68 + fill.value * (1 - SCALE.s0_68) }] };
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={OFFSET.o8}
      style={({ pressed }) => [styles.item, pressed && { opacity: ALPHA.a70 }]}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={circle.a11y}
      accessibilityHint={!onPress ? undefined : filled ? 'Takes them off this post' : 'Adds a mate'}
    >
      <View style={styles.circle}>
        <Reanimated.View
          style={[styles.layer, styles.empty, { borderColor: COLORS.accent }, emptyStyle]}
        >
          <Text style={[styles.plus, { color: colors.accentText }]}>+</Text>
        </Reanimated.View>
        <Reanimated.View style={[styles.layer, filledStyle]} pointerEvents="none">
          {face.kind === 'empty' ? null : (
            <Reanimated.View
              key={face.key}
              entering={FadeIn.duration(DURATION.d200).reduceMotion(ReduceMotion.Never)}
              style={[styles.layer, styles.face]}
            >
              {face.kind === 'friend' && face.avatarUrl ? (
                <Image
                  source={{ uri: face.avatarUrl, cache: 'force-cache' }}
                  style={styles.photo}
                />
              ) : (
                <Text style={styles.faceText}>
                  {face.kind === 'friend' ? face.initial : face.link}
                </Text>
              )}
            </Reanimated.View>
          )}
          <View style={[styles.check, { borderColor: dark ? COLORS.offBlack : COLORS.white }]}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        </Reanimated.View>
      </View>
      {compact ? null : (
        <Text
          style={[styles.caption, { color: filled ? colors.text : colors.muted }]}
          numberOfLines={1}
        >
          {circle.caption}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: SPACE.s16,
  },
  title: {
    fontSize: FONT_SIZE.f20,
    lineHeight: LINE_HEIGHT.l28,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACE.s20,
  },
  item: {
    alignItems: 'center',
    gap: SPACE.s6,
    width: SIZE.z88,
  },
  circle: {
    width: SIZE.z72,
    height: SIZE.z72,
  },
  layer: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    borderWidth: BORDER_WIDTH.w2,
    borderStyle: 'dashed',
  },
  plus: {
    fontSize: FONT_SIZE.f28,
    lineHeight: LINE_HEIGHT.l38,
    fontFamily: FONTS.regular,
  },
  face: {
    backgroundColor: COLORS.accent,
    overflow: 'hidden',
  },
  photo: {
    width: SIZE.z72,
    height: SIZE.z72,
  },
  faceText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f28,
    fontFamily: FONTS.bold,
  },
  check: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: SIZE.z24,
    height: SIZE.z24,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER_WIDTH.w2,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.bold,
  },
  caption: {
    minHeight: LINE_HEIGHT.l16,
    lineHeight: LINE_HEIGHT.l16,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
});
