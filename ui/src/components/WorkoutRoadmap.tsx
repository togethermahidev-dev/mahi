import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT_SIZE, RADIUS, SIZE, SPACE } from '@/constants/tokens';
import { FONTS } from '@/constants/fonts';
import { useAppTheme } from '@/hooks/useAppTheme';
import { roadmap } from '@/lib/workoutRoadmap';


export default function WorkoutRoadmap({
  firstWorkoutDone,
  tagged,
  captured = false,
}: {
  firstWorkoutDone: boolean | null;
  tagged: boolean;
  captured?: boolean;
}) {
  const scroll = useRef<ScrollView>(null);
  const reduceMotion = useReducedMotion();
  // It sits on the page's own background (light or dark), so its words follow the theme.
  const { colors } = useAppTheme();
  const map = roadmap({ firstWorkoutDone, tagged, captured });
  const current = map?.current ?? 0;
  useEffect(() => {
    scroll.current?.scrollTo({ x: current * (SIZE.z200 + SPACE.s16), animated: !reduceMotion });
  }, [current, reduceMotion]);
  // Not known yet whether you've posted: a spinner, never a step that then changes.
  if (!map) {
    return (
      <View
        style={styles.root}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your progress"
      >
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }
  const { steps } = map;
  return (
    <View style={styles.root}>
      <Text style={[styles.hint, { color: colors.muted }]}>
        {`Your next step: ${steps[current][0]}`}
      </Text>
      <ScrollView
        ref={scroll}
        onLayout={() =>
          scroll.current?.scrollTo({ x: current * (SIZE.z200 + SPACE.s16), animated: false })
        }
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SIZE.z200 + SPACE.s16}
        decelerationRate="fast"
        contentContainerStyle={styles.track}
      >
        {steps.map(([title, body], index) => (
          <View
            key={title}
            style={styles.step}
            accessible
            accessibilityLabel={`Step ${index + 1}, ${index < current ? 'completed' : index === current ? 'current' : 'up next'}. ${title}. ${body}`}
          >
            <View
              style={[
                styles.circle,
                {
                  backgroundColor:
                    index === current
                      ? COLORS.accent
                      : colors.text,
                },
              ]}
            >
              <Text
                style={[
                  styles.number,
                  index !== current && { color: colors.bg },
                ]}
              >
                {index < current ? '✓' : index + 1}
              </Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>{body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: SPACE.s8, marginBottom: SPACE.s16 },
  hint: {
    color: COLORS.offWhite,
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f12,
    textAlign: 'center',
  },
  track: { gap: SPACE.s16, paddingVertical: SPACE.s12 },
  step: { width: SIZE.z200, alignItems: 'center', gap: SPACE.s8 },
  circle: {
    width: SIZE.z64,
    height: SIZE.z64,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.offWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { color: COLORS.offBlack, fontFamily: FONTS.bold, fontSize: FONT_SIZE.f24 },
  title: {
    color: COLORS.offWhite,
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f15,
    textAlign: 'center',
  },
  body: {
    color: COLORS.offWhite,
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
    textAlign: 'center',
  },
});
