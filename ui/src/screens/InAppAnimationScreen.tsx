import React, { useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '@/hooks/useAppTheme';
import { haptic } from '@/lib/haptics';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  FONT_SIZE,
  OFFSET,
  RADIUS,
  SHUTTER,
  SIZE,
  SPACE,
  TRACKING,
} from '@/constants/tokens';

interface Props {
  onComplete: () => void;
}

/**
 * The shutter after sign-in, Mahi's camera moment: two halves snap shut with a little overshoot
 * and a firm tap, a cyan light runs along the seam, MAHI lands with its cyan echo sliding out
 * behind it, then the shutter fires — a quick flash — and the halves fly apart onto the camera.
 * With Reduce Motion on, the same screen simply fades in and out.
 */
export default function InAppAnimationScreen({ onComplete }: Props): React.JSX.Element {
  const { dark } = useAppTheme();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const sheetBg = dark ? COLORS.bgDark : COLORS.white;
  const sheetText = dark ? COLORS.white : COLORS.inkDeep;

  const top = useSharedValue(reduceMotion ? 0 : -height);
  const bottom = useSharedValue(reduceMotion ? 0 : height);
  const seam = useSharedValue(0);
  const seamFade = useSharedValue(1);
  const mark = useSharedValue(reduceMotion ? 1 : SHUTTER.wordmarkFrom);
  const markOpacity = useSharedValue(0);
  const echo = useSharedValue(0);
  const tagline = useSharedValue(0);
  const flash = useSharedValue(0);
  const screen = useSharedValue(reduceMotion ? 0 : 1);

  useEffect(() => {
    const done = () => onComplete();

    if (reduceMotion) {
      markOpacity.value = 1;
      echo.value = 1;
      tagline.value = 1;
      screen.value = withSequence(
        withTiming(1, { duration: SHUTTER.fadeMs }),
        withDelay(
          SHUTTER.holdMs,
          withTiming(0, { duration: SHUTTER.fadeMs }, (finished) => {
            if (finished) runOnJS(done)();
          })
        )
      );
      return;
    }

    const wait = SHUTTER.startDelayMs;
    // 1. Snap shut.
    top.value = withDelay(wait, withSpring(0, SHUTTER.close));
    bottom.value = withDelay(
      wait,
      withSpring(0, SHUTTER.close, (finished) => {
        if (finished) runOnJS(haptic)('shutter');
      })
    );
    // 2. The seam lights up and fades; MAHI lands, its echo slides out, the tagline rises.
    const landed = wait + SHUTTER.seamMs;
    seam.value = withDelay(landed, withTiming(1, { duration: SHUTTER.seamMs }));
    seamFade.value = withDelay(
      landed + SHUTTER.seamMs,
      withTiming(0, { duration: SHUTTER.seamMs })
    );
    mark.value = withDelay(landed, withSpring(1, SHUTTER.close));
    markOpacity.value = withDelay(landed, withTiming(1, { duration: SHUTTER.seamMs }));
    echo.value = withDelay(
      landed + SHUTTER.echoDelayMs,
      withTiming(1, { duration: SHUTTER.echoMs, easing: Easing.out(Easing.cubic) })
    );
    tagline.value = withDelay(
      landed + SHUTTER.taglineDelayMs,
      withTiming(1, { duration: SHUTTER.echoMs, easing: Easing.out(Easing.cubic) })
    );
    // 3. Hold, then fire: a flash, and the halves fly apart onto the camera.
    const fire = landed + SHUTTER.taglineDelayMs + SHUTTER.echoMs + SHUTTER.holdMs;
    flash.value = withDelay(
      fire,
      withSequence(
        withTiming(1, { duration: SHUTTER.flashMs }),
        withTiming(0, { duration: SHUTTER.flashMs })
      )
    );
    const open = fire + SHUTTER.flashMs;
    const away = { duration: SHUTTER.openMs, easing: Easing.in(Easing.cubic) };
    mark.value = withDelay(open, withTiming(SHUTTER.wordmarkTo, away));
    markOpacity.value = withDelay(open, withTiming(0, away));
    tagline.value = withDelay(open, withTiming(0, away));
    top.value = withDelay(open, withTiming(-height, away));
    bottom.value = withDelay(
      open,
      withTiming(height, away, (finished) => {
        if (finished) runOnJS(done)();
      })
    );
    // Runs once, on mount: the screen unmounts when it completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: screen.value }));
  const topStyle = useAnimatedStyle(() => ({ transform: [{ translateY: top.value }] }));
  const bottomStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bottom.value }] }));
  const seamStyle = useAnimatedStyle(() => ({
    opacity: seamFade.value,
    transform: [{ scaleX: seam.value }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: mark.value }],
  }));
  const echoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: OFFSET.o4 * echo.value }, { translateY: OFFSET.o4 * echo.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value * ALPHA.a70,
    transform: [{ translateY: OFFSET.o12 * (1 - tagline.value) }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * ALPHA.a60 }));

  return (
    <Animated.View style={[styles.root, rootStyle]}>
      <Animated.View style={[styles.topSheet, { backgroundColor: sheetBg }, topStyle]}>
        <Animated.View style={[styles.titles, markStyle]}>
          <View style={styles.titleWrapper} accessible accessibilityLabel="Mahi">
            <Animated.Text style={[styles.title, styles.titleEcho, echoStyle]}>MAHI</Animated.Text>
            <Text style={[styles.title, { color: sheetText }]}>MAHI</Text>
          </View>
          <Animated.Text style={[styles.subtitle, { color: sheetText }, taglineStyle]}>
            The fitness accountability app
          </Animated.Text>
        </Animated.View>
      </Animated.View>

      <View style={styles.gap}>
        <Animated.View style={[styles.seam, seamStyle]} />
      </View>

      <Animated.View style={[styles.bottomSheet, { backgroundColor: sheetBg }, bottomStyle]} />

      <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />
    </Animated.View>
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
  titleEcho: { position: 'absolute', color: COLORS.accent, top: 0, left: 0 },
  title: {
    fontSize: FONT_SIZE.f56,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t10,
  },
  subtitle: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.regular,
  },
  gap: { height: SIZE.z55, justifyContent: 'center', paddingHorizontal: SPACE.s40 },
  seam: { height: SIZE.z2, borderRadius: RADIUS.r2, backgroundColor: COLORS.accent },
  bottomSheet: {
    flex: 1,
    borderTopLeftRadius: RADIUS.r40,
    borderTopRightRadius: RADIUS.r40,
  },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.white },
});
