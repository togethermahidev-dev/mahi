import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONTS } from '@/constants/fonts';
import { COLORS, FONT_SIZE, RADIUS, SIZE, SPACE } from '@/constants/tokens';

/**
 * A small accent pill with a number (e.g. how many invites you have). Nothing at 0. VoiceOver
 * reads the number as part of the row it sits in, so the badge itself is hidden from it.
 */
export default function CountBadge({ count }: { count: number }): React.JSX.Element | null {
  if (count <= 0) return null;
  return (
    <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={styles.text}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: SIZE.z20,
    height: SIZE.z20,
    paddingHorizontal: SPACE.s6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: COLORS.offBlack,
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f12,
  },
});
