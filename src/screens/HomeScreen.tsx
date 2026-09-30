import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FONTS } from '@/constants/fonts';
import { COLORS, FONT_SIZE, TRACKING } from '@/constants/tokens';

export default function HomeScreen(): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: FONT_SIZE.f24,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t8,
  },
});
