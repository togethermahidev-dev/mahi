import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

const BG = '#59c2d7';
const TEXT_COLOR = '#FFFFFF';
const ECHO_COLOR = 'rgba(255,255,255,0.3)';

// Read once at module level — these never change at runtime
const version = Constants.expoConfig?.version ?? '';
const buildNumber =
  (Constants.expoConfig?.extra as { buildNumber?: string } | null)?.buildNumber ?? '';
const VERSION_STRING = `V.${version} ${buildNumber}`;

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
      <Text style={styles.version}>{VERSION_STRING}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  titleWrapper: { position: 'relative' },
  titleEcho: { position: 'absolute', color: ECHO_COLOR, top: 3, left: 3 },
  title: { color: TEXT_COLOR, fontSize: 48, fontWeight: '700', letterSpacing: 8 },
  version: { color: TEXT_COLOR, fontSize: 11, position: 'absolute', bottom: 40 },
});
