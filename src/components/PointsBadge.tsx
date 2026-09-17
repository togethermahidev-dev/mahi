import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

/** "🔥 12" — a person's Mahi points. Hidden when the `mahi-points` flag is off or points are unknown. */
export default function PointsBadge({
  points,
  style,
}: {
  points: number | null | undefined;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element | null {
  const enabled = useFeatureFlag('mahi-points');
  if (!enabled || points == null) return null;
  return <Text style={[styles.text, style]}>🔥 {points}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 13,
  },
});
