import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FadeInItem } from '@/components/Motion';
import { LETTERING, TYPOGRAPHY } from '@/constants/typography';
import {
  ALPHA,
  BORDER_WIDTH,
  DURATION,
  RADIUS,
  SCALE,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

const STEPS = [
  { number: '1', title: 'Show up', body: 'Post your first workout and tag 1 mate.' },
  { number: '2', title: 'Get tagged', body: 'A friend calls you to train. You have 48 hours.' },
  {
    number: '3',
    title: 'Answer and pass it on',
    body: 'Your workout is the answer. Hold 3 friends accountable.',
  },
] as const;

/** The product loop, repeated verbatim wherever a newcomer needs the whole mental model. */
export default function AccountabilityLoop(): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: withAlpha(colors.text, ALPHA.a05),
          borderColor: withAlpha(colors.accent, ALPHA.a35),
        },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={STEPS.map((step) => `${step.number}. ${step.title}. ${step.body}`).join(
        ' '
      )}
    >
      <Text style={[styles.eyebrow, { color: colors.accentText }]}>How Mahi works</Text>
      <Text style={[styles.heading, { color: colors.text }]}>The workout accountability loop</Text>
      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <LoopStep key={step.number} step={step} index={index} />
        ))}
      </View>
    </View>
  );
}

function LoopStep({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const energy = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    energy.value = withRepeat(
      withSequence(
        withTiming(1, { duration: DURATION.d400 }),
        withTiming(0, { duration: DURATION.d400 })
      ),
      -1,
      false
    );
  }, [energy, reduceMotion]);
  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: index === 0 ? interpolate(energy.value, [0, 1], [1, SCALE.s1_06]) : 1 }],
  }));
  const energyLine = useAnimatedStyle(() => ({
    opacity: interpolate(energy.value, [0, 1], [ALPHA.a25, ALPHA.a70]),
    transform: [{ scaleY: interpolate(energy.value, [0, 1], [ALPHA.a72, 1]) }],
  }));

  return (
    <FadeInItem index={index} style={styles.step}>
      <View style={styles.track}>
        <Reanimated.View
          style={[
            styles.number,
            { backgroundColor: colors.accent, borderColor: colors.accent },
            pulse,
          ]}
        >
          <Text style={[styles.numberText, { color: colors.offBlack }]}>{step.number}</Text>
        </Reanimated.View>
        {index < STEPS.length - 1 ? (
          <Reanimated.View
            style={[
              styles.line,
              { backgroundColor: withAlpha(colors.accent, ALPHA.a70) },
              energyLine,
            ]}
          />
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>
        <Text style={[styles.body, { color: withAlpha(colors.text, ALPHA.a70) }]}>{step.body}</Text>
      </View>
    </FadeInItem>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: SIZE.z360,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r24,
    padding: SPACE.s20,
    gap: SPACE.s16,
  },
  eyebrow: {
    ...TYPOGRAPHY.sectionHeader,
  },
  heading: {
    ...TYPOGRAPHY.h2,
  },
  steps: { gap: 0 },
  step: { flexDirection: 'row', minHeight: SIZE.z64 },
  track: { width: SIZE.z36, alignItems: 'center' },
  number: {
    width: SIZE.z32,
    height: SIZE.z32,
    borderRadius: RADIUS.r16,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { ...LETTERING.numeralSmall },
  line: { flex: 1, width: SIZE.z2 },
  copy: { flex: 1, paddingLeft: SPACE.s12, paddingBottom: SPACE.s12 },
  title: {
    ...TYPOGRAPHY.h4,
  },
  body: {
    ...TYPOGRAPHY.small,
    marginTop: SPACE.s2,
  },
});
