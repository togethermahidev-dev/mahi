import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, useColorScheme } from 'react-native';
import { FONTS } from '@/constants/fonts';
import { COLORS, FONT_SIZE, SPACE, RADIUS, OFFSET, TRACKING, SIZE } from '@/constants/tokens';

const { height } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

export default function InAppAnimationScreen({ onComplete }: Props): React.JSX.Element {
  const dark = useColorScheme() === 'dark';
  const sheetBg = dark ? COLORS.bgDark : COLORS.white;
  const sheetText = dark ? COLORS.white : COLORS.inkDeep;

  // Both values double as entry and exit: -height→0 (in), 0→-height (out top) / height→0 (in), 0→height (out bottom)
  const topAnim = useRef(new Animated.Value(-height)).current;
  const bottomAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout>;

    // Brief pause lets native auth modal finish its dismiss animation
    const entryTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(topAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(bottomAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => {
        // Hold so the user sees the MAHI branding
        holdTimer = setTimeout(() => {
          // Top exits up, bottom exits down — same split as WelcomeScreen
          Animated.parallel([
            Animated.timing(topAnim, { toValue: -height, duration: 400, useNativeDriver: true }),
            Animated.timing(bottomAnim, { toValue: height, duration: 400, useNativeDriver: true }),
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
          <View style={styles.titleWrapper}>
            <Text style={[styles.title, styles.titleEcho]}>MAHI</Text>
            <Text style={[styles.title, { color: sheetText }]}>MAHI</Text>
          </View>
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
  root: { flex: 1, backgroundColor: COLORS.ink },
  topSheet: {
    flex: 1,
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s80,
    paddingBottom: SPACE.s40,
    borderBottomLeftRadius: RADIUS.r40,
    borderBottomRightRadius: RADIUS.r40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { alignItems: 'center' },
  titleWrapper: { position: 'relative', marginBottom: SPACE.s12 },
  titleEcho: { position: 'absolute', color: COLORS.accent, top: OFFSET.o4, left: OFFSET.o4 },
  title: {
    fontSize: FONT_SIZE.f56,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t10,
  },
  subtitle: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.italic,
    opacity: 0.7,
  },
  gap: { height: SIZE.z55 },
  bottomSheet: {
    flex: 1,
    borderTopLeftRadius: RADIUS.r40,
    borderTopRightRadius: RADIUS.r40,
  },
});
