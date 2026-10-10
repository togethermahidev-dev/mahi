import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { TYPOGRAPHY } from '@/constants/typography';
import { LAYOUT } from '@/constants/tokens';
import { pointsCount } from '@/lib/mahiPoints';

/**
 * "12 points" — a person's Mahi points (no flame: points are not a streak). Hidden when unknown.
 * The number and its word are one piece of text on one line, and it keeps its own width in a
 * row: the name beside it wraps instead, so the two never run into each other. It grows only up
 * to large text, so at the biggest settings the name still has room.
 */
export default function PointsBadge({
  points,
  style,
}: {
  points: number | null | undefined;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element | null {
  if (points == null) return null;
  return (
    <Text
      style={[styles.text, style]}
      numberOfLines={1}
      maxFontSizeMultiplier={LAYOUT.largeTextScale}
    >
      {pointsCount(points)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...TYPOGRAPHY.label,
    flexShrink: 0,
  },
});
