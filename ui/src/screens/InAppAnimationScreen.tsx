import React, { useEffect, useRef } from 'react';
import { AppState, View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Path } from 'react-native-svg';
import { LETTERING, TYPOGRAPHY } from '@/constants/typography';
import { COLORS, ALPHA, SPACE, BORDER_WIDTH, LAUNCH_LENS as L } from '@/constants/tokens';
import { haptic, type HapticMoment } from '@/lib/haptics';
import { lensBladePath } from '@/lib/launchLens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const BLADES = Array.from({ length: L.blades }, (_, index) => index);
const BLADE_COLORS = [
  COLORS.ink,
  COLORS.inkSoft,
  COLORS.offBlack,
  COLORS.bgDark,
  COLORS.surfaceDark2,
  COLORS.inkDeep,
];

function Blade({
  index,
  progress,
  extent,
}: {
  index: number;
  progress: SharedValue<number>;
  extent: number;
}) {
  const animatedProps = useAnimatedProps(() => ({
    d: lensBladePath(
      index,
      interpolate(
        progress.value,
        [0, L.focus, L.closed, L.release, 1],
        [extent * L.openRadius, extent * L.focusRadius, 0, 0, extent * L.openRadius]
      ),
      extent * 2
    ),
  }));
  return (
    <AnimatedPath
      animatedProps={animatedProps}
      fill={BLADE_COLORS[index]}
      stroke={COLORS.borderDark}
      strokeWidth={BORDER_WIDTH.w1}
    />
  );
}

interface Props {
  /** Mount the destination while the aperture is fully closed. */
  onReveal: () => void;
  onComplete: () => void;
}

export default function InAppAnimationScreen({ onReveal, onComplete }: Props): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const extent = Math.hypot(width, height) / 2;
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const fade = useSharedValue(1);
  const callbacks = useRef({ onReveal, onComplete });
  useEffect(() => {
    callbacks.current = { onReveal, onComplete };
  }, [onReveal, onComplete]);

  useEffect(() => {
    let alive = true;
    let revealed = false;
    let completed = false;
    const feel = (moment: HapticMoment) => {
      if (alive && !reduced && AppState.currentState === 'active') haptic(moment);
    };
    const reveal = () => {
      if (!alive || revealed) return;
      revealed = true;
      callbacks.current.onReveal();
    };
    const complete = () => {
      if (!alive || completed) return;
      completed = true;
      reveal();
      callbacks.current.onComplete();
    };
    progress.value = 0;
    fade.value = 1;
    if (reduced) {
      reveal();
      fade.value = withTiming(0, { duration: L.reducedMs }, (done) => {
        if (done) scheduleOnRN(complete);
      });
    } else {
      progress.value = withSequence(
        withTiming(L.focus, { duration: L.focusMs, easing: Easing.out(Easing.cubic) }, (done) => {
          if (done) scheduleOnRN(feel, 'tick');
        }),
        withTiming(L.closed, { duration: L.closeMs, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) {
            scheduleOnRN(feel, 'shutter');
            scheduleOnRN(reveal);
          }
        }),
        withTiming(L.release, { duration: L.holdMs }, (done) => {
          if (done) scheduleOnRN(feel, 'flip');
        }),
        withTiming(1, { duration: L.openMs, easing: Easing.inOut(Easing.cubic) }, (done) => {
          if (done) scheduleOnRN(complete);
        })
      );
    }
    // Never replay a capture or strand the launch screen after an interruption.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        cancelAnimation(progress);
        cancelAnimation(fade);
        complete();
      }
    });
    return () => {
      alive = false;
      subscription.remove();
      cancelAnimation(progress);
      cancelAnimation(fade);
    };
  }, [fade, progress, reduced]);

  const rootMotion = useAnimatedStyle(() => ({ opacity: fade.value }));
  const brandMotion = useAnimatedStyle(() => ({
    opacity: progress.value < L.closed ? 1 : 0,
  }));
  const reticleMotion = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, L.focus, L.closed], [0, 1, 0], 'clamp'),
    transform: [{ scale: interpolate(progress.value, [0, L.focus], [L.focusScale, 1], 'clamp') }],
  }));
  const pulseMotion = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [L.closed, (L.closed + L.release) / 2, L.release],
      [0, ALPHA.a18, 0],
      'clamp'
    ),
  }));

  return (
    <Animated.View
      style={[styles.root, rootMotion]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.brand, brandMotion]}>
        <Text style={styles.eyebrow}>The fitness accountability app</Text>
        <Text style={styles.title}>MAHI</Text>
        <Text style={styles.tagline}>Show up. Make it count.</Text>
      </Animated.View>
      {!reduced && (
        <>
          <Svg
            width={width}
            height={height}
            viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`}
            style={StyleSheet.absoluteFill}
          >
            {BLADES.map((index) => (
              <Blade key={index} index={index} progress={progress} extent={extent} />
            ))}
          </Svg>
          <Animated.View style={[styles.focus, reticleMotion]}>
            <View style={styles.ring} />
            <View style={styles.reticle}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.pulse, pulseMotion]} />
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  brand: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s24,
  },
  eyebrow: {
    ...TYPOGRAPHY.microStrong,
    position: 'absolute',
    bottom: SPACE.s80,
    color: COLORS.ink,
  },
  title: {
    ...LETTERING.wordmarkLaunch,
    color: COLORS.ink,
  },
  tagline: {
    ...TYPOGRAPHY.microStrong,
    marginTop: SPACE.s12,
    color: COLORS.ink,
  },
  focus: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: L.ringSize,
    height: L.ringSize,
    borderRadius: L.ringSize / 2,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: COLORS.accent,
    opacity: ALPHA.a30,
  },
  reticle: { width: L.reticleSize, height: L.reticleSize },
  corner: { position: 'absolute', width: SPACE.s24, height: SPACE.s24, borderColor: COLORS.ink },
  topLeft: { top: 0, left: 0, borderTopWidth: BORDER_WIDTH.w2, borderLeftWidth: BORDER_WIDTH.w2 },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: BORDER_WIDTH.w2,
    borderRightWidth: BORDER_WIDTH.w2,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: BORDER_WIDTH.w2,
    borderLeftWidth: BORDER_WIDTH.w2,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: BORDER_WIDTH.w2,
    borderRightWidth: BORDER_WIDTH.w2,
  },
  pulse: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.accent },
});
