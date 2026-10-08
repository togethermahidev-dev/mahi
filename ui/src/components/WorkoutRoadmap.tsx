import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT_SIZE, RADIUS, SIZE, SPACE } from '@/constants/tokens';
import { FONTS } from '@/constants/fonts';

const steps = [
  ['Show up once', 'Post your first workout. No tag needed.'],
  ['Wait for a tag', 'A friend’s tag lets you post your next workout.'],
  [
    'Answer with live proof of your workout',
    'Capture your workout and a selfie before the tag expires.',
  ],
  ['Hold 3 friends accountable', 'Tag 3 friends you want to see show up next.'],
];

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
  const current = !firstWorkoutDone ? 0 : !tagged ? 1 : captured ? 3 : 2;
  useEffect(() => {
    scroll.current?.scrollTo({ x: current * (SIZE.z200 + SPACE.s16), animated: !reduceMotion });
  }, [current, reduceMotion]);
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Your Mahi roadmap</Text>
      <Text style={styles.hint}>
        {firstWorkoutDone === null
          ? 'Loading your progress…'
          : `Your next step: ${steps[current][0]}`}
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
                      : index < current
                        ? COLORS.offWhite
                        : COLORS.surfaceDark,
                },
              ]}
            >
              <Text style={[styles.number, index > current && { color: COLORS.offWhite }]}>
                {index < current ? '✓' : index + 1}
              </Text>
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: SPACE.s8, marginBottom: SPACE.s16 },
  heading: {
    color: COLORS.offWhite,
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f18,
    textAlign: 'center',
  },
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
