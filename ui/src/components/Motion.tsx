/**
 * Small pieces of motion shared across the app, all from MOTION tokens and all Reanimated (on the
 * UI thread). Reduce Motion: nothing moves or scales — things fade instead.
 * - PressScale: a button that shrinks a touch while pressed and springs back.
 * - FadeInItem: a list row or banner that fades and rises in, a beat after the one above it.
 * - CountdownRing: a ring that drains as time runs out.
 * - CountUp: a number that counts up to its new value.
 * - Skeleton: a block that gently breathes while content loads.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { ALPHA, DURATION, MOTION } from '@/constants/tokens';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);

export function PressScale({
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const anim = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: 1 - pressed.value * (1 - ALPHA.a75) }
      : { transform: [{ scale: 1 - pressed.value * (1 - MOTION.pressScale) }] }
  );
  return (
    <AnimatedPressable
      {...rest}
      style={[style, anim]}
      onPressIn={(e) => {
        pressed.value = withSpring(1, MOTION.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, MOTION.press);
        onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

/** The entering animation for the row at `index`: rise and fade, staggered; a plain fade with
 *  Reduce Motion. */
export function useEntering(index = 0) {
  const reduceMotion = useReducedMotion();
  const delay = Math.min(index, MOTION.staggerMax) * MOTION.staggerMs;
  return reduceMotion
    ? FadeIn.duration(DURATION.d200).delay(delay).reduceMotion(ReduceMotion.Never)
    : FadeInDown.springify()
        .damping(MOTION.morph.damping)
        .stiffness(MOTION.morph.stiffness)
        .mass(MOTION.morph.mass)
        .withInitialValues({ transform: [{ translateY: MOTION.riseY }] })
        .delay(delay);
}

export function FadeInItem({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Reanimated.View entering={useEntering(index)} style={style}>
      {children}
    </Reanimated.View>
  );
}

/** A ring that drains from full (`progress` 1) to empty (0). */
export function CountdownRing({
  progress,
  color,
  track,
}: {
  progress: number;
  color: string;
  track: string;
}): React.JSX.Element {
  const size = MOTION.ringSize;
  const stroke = MOTION.ringStroke;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = useSharedValue(progress);
  useEffect(() => {
    shown.value = withTiming(progress, { duration: DURATION.d400 });
  }, [progress, shown]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - shown.value) }));
  return (
    <Svg width={size} height={size} accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        animatedProps={props}
        // Starts at 12 o'clock and drains clockwise.
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

/** Counts from the last value shown up to `value`; a fall or Reduce Motion jumps straight there. */
export function useCountUp(value: number | null): number | null {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (value === null || start === null || value <= start || reduceMotion) {
      setShown(value);
      return;
    }
    const began = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - began) / MOTION.countUpMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduceMotion]);
  return shown;
}

/** A soft pop (scale up and back) each time `trigger` changes; nothing with Reduce Motion. */
export function usePop(trigger: unknown) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion) return;
    scale.value = withSequence(
      withTiming(1 / MOTION.pressScale, { duration: DURATION.d150 }),
      withSpring(1, MOTION.morph)
    );
  }, [trigger, reduceMotion, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/** A placeholder block that breathes while the real thing loads (holds still with Reduce Motion). */
export function Skeleton({ style }: { style: StyleProp<ViewStyle> }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const level = useSharedValue<number>(MOTION.skeletonLow);
  useEffect(() => {
    if (reduceMotion) return;
    level.value = withRepeat(
      withTiming(MOTION.skeletonHigh, {
        duration: MOTION.skeletonMs,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );
  }, [reduceMotion, level]);
  const anim = useAnimatedStyle(() => ({ opacity: level.value }));
  return <Reanimated.View style={[style, anim]} />;
}
