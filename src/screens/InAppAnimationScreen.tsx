import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  useColorScheme,
} from 'react-native';

const { height } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

export default function InAppAnimationScreen({ onComplete }: Props): React.JSX.Element {
  const dark = useColorScheme() === 'dark';
  const sheetBg   = dark ? '#1C1C19' : '#FFFFFF';
  const sheetText = dark ? '#FFFFFF' : '#0F0F0D';

  // Both values double as entry and exit: -height→0 (in), 0→-height (out top) / height→0 (in), 0→height (out bottom)
  const topAnim    = useRef(new Animated.Value(-height)).current;
  const bottomAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout>;

    // Brief pause lets native auth modal finish its dismiss animation
    const entryTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(topAnim,    { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(bottomAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => {
        // Hold so the user sees the MAHI branding
        holdTimer = setTimeout(() => {
          // Top exits up, bottom exits down — same split as WelcomeScreen
          Animated.parallel([
            Animated.timing(topAnim,    { toValue: -height, duration: 400, useNativeDriver: true }),
            Animated.timing(bottomAnim, { toValue:  height, duration: 400, useNativeDriver: true }),
          ]).start(() => onComplete());
        }, 1500);
      });
    }, 400);

    return () => {
      clearTimeout(entryTimer);
      clearTimeout(holdTimer);
      topAnim.stopAnimation();
      bottomAnim.stopAnimation();
    };
  }, []);

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.topSheet,
          { backgroundColor: sheetBg },
          { transform: [{ translateY: topAnim }] },
        ]}
      >
        <View style={styles.titles}>
          <Text style={[styles.title, { color: sheetText }]}>MAHI</Text>
          <Text style={[styles.subtitle, { color: sheetText }]}>
            The fitness accountability app
          </Text>
        </View>
      </Animated.View>

      <View style={styles.gap} />

      <Animated.View
        style={[
          styles.bottomSheet,
          { backgroundColor: sheetBg },
          { transform: [{ translateY: bottomAnim }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  topSheet: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { alignItems: 'center' },
  title: {
    fontSize: 56,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 10,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'JosefinSans_400Regular_Italic',
    opacity: 0.7,
  },
  gap: { height: 55 },
  bottomSheet: {
    flex: 1,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
});
