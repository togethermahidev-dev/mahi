import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import Constants from 'expo-constants';

const LIGHT_BG = '#F5F5F0';
const DARK_BG = '#0F0F0D';
const TEXT_COLOR = '#FFFFFF';

// Read once at module level — these never change at runtime
const version = Constants.expoConfig?.version ?? '';
const buildNumber =
  (Constants.expoConfig?.extra as { buildNumber?: string } | null)?.buildNumber ?? '';
const VERSION_STRING = `V.${version} ${buildNumber}`;

interface Props {
  onLayout: () => void;
}

export default function SplashScreen({ onLayout }: Props): React.JSX.Element {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'dark' ? DARK_BG : LIGHT_BG;

  return (
    <View style={[styles.container, { backgroundColor }]} onLayout={onLayout}>
      <Text style={styles.title}>MAHI</Text>
      <Text style={styles.version}>{VERSION_STRING}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: TEXT_COLOR, fontSize: 48, fontWeight: '700', letterSpacing: 8 },
  version: { color: TEXT_COLOR, fontSize: 11, position: 'absolute', bottom: 40 },
});
