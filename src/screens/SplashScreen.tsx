import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { VERSION_LINE } from '@/lib/appBuild';
import { COLORS, withAlpha, FONT_SIZE, OFFSET, TRACKING } from '@/constants/tokens';

const BG = COLORS.accent;
const TEXT_COLOR = COLORS.white;
const ECHO_COLOR = withAlpha(COLORS.white, 0.3);

interface Props {
  onLayout: () => void;
}

export default function SplashScreen({ onLayout }: Props): React.JSX.Element {
  return (
    <View style={styles.container} onLayout={onLayout}>
      <View style={styles.titleWrapper}>
        <Text style={[styles.title, styles.titleEcho]}>MAHI</Text>
        <Text style={styles.title}>MAHI</Text>
      </View>
      <Text style={styles.version}>{VERSION_LINE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  titleWrapper: { position: 'relative' },
  titleEcho: { position: 'absolute', color: ECHO_COLOR, top: OFFSET.o3, left: OFFSET.o3 },
  title: {
    color: TEXT_COLOR,
    fontSize: FONT_SIZE.f48,
    fontWeight: '700',
    letterSpacing: TRACKING.t8,
  },
  version: { color: TEXT_COLOR, fontSize: FONT_SIZE.f11, position: 'absolute', bottom: OFFSET.o40 },
});
