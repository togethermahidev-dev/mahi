import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { FONTS } from '@/constants/fonts';
import { FONT_SIZE } from '@/constants/tokens';
import { pointsCount } from '@/lib/mahiPoints';

/** "12 points" — a person's Mahi points (no flame: points are not a streak). Hidden when unknown. */
export default function PointsBadge({
  points,
  style,
}: {
  points: number | null | undefined;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element | null {
  if (points == null) return null;
  return <Text style={[styles.text, style]}>{pointsCount(points)}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f13,
  },
});
