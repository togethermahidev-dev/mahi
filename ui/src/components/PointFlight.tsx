/**
 * A Mahi point landing (owner, 2026-10-07, #116): "+1" springs up near the shutter, holds a beat,
 * then curves into the points counter, which rolls up and pops (the camera's PointsCounter does
 * that when `onLanded` releases its number). A small glass card under the counter names the mate
 * ("@sam kept you going") with Cheer, and hides by itself. A milestone bursts a ring of accent
 * dots round the counter. Rules and words: src/lib/pointMoments.ts.
 *
 * Reduce Motion: the "+1" fades in at the counter, no flight and no dots; the number just changes.
 */
import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { burstDots, flyPoint, type Point } from '@/lib/pointMoments';
import { useCoachBlock } from '@/hooks/useCoachMarks';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  COLORS,
  DURATION,
  FONT_SIZE,
  MOTION,
  RADIUS,
  SIZE,
  SPACE,
  SPRING,
  withAlpha,
} from '@/constants/tokens';

export interface Flight {
  /** A new id for each point, so a second one starts afresh. */
  id: string;
  /** Where the "+1" springs up (near the shutter) and where it lands (the counter's middle). */
  from: Point;
  to: Point;
  title: string;
  line: string;
  milestone: boolean;
  liveText: string;
  cheer?: { label: string; onPress: () => void };
  /** Where the card sits: its top, right under the counter. */
  cardTop: number;
}

export default function PointFlight({
  flight,
  onLanded,
  onDone,
}: {
  flight: Flight | null;
  /** The "+1" reached the counter: roll the number up and feel it. */
  onLanded: () => void;
  /** The card has gone. */
  onDone: () => void;
}): React.JSX.Element | null {
  // No one-time tip while the point lands.
  useCoachBlock(flight !== null);
  if (!flight) return null;
  return <FlightRun key={flight.id} flight={flight} onLanded={onLanded} onDone={onDone} />;
}

const CHIP = SIZE.z56;

function FlightRun({
  flight,
  onLanded,
  onDone,
}: {
  flight: Flight;
  onLanded: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  const rise = useSharedValue(0);
  const chipOpacity = useSharedValue(reduceMotion ? 0 : 1);
  const burst = useSharedValue(0);
  const [landed, setLanded] = React.useState(false);

  useEffect(() => {
    const land = () => {
      setLanded(true);
      onLanded();
    };
    if (reduceMotion) {
      // A fade at the counter, then the number changes.
      chipOpacity.value = withSequence(
        withTiming(1, { duration: DURATION.d200, reduceMotion: ReduceMotion.Never }),
        withTiming(0, { duration: DURATION.d400, reduceMotion: ReduceMotion.Never }, (done) => {
          if (done) scheduleOnRN(land);
        })
      );
      return;
    }
    rise.value = withSpring(1, MOTION.morph);
    t.value = withDelay(
      MOTION.holdBeatMs,
      withSpring(1, SPRING.fly, (done) => {
        if (!done) return;
        chipOpacity.value = withTiming(0, { duration: DURATION.d150 });
        scheduleOnRN(land);
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The dots, and the card hiding by itself.
  useEffect(() => {
    if (!landed) return;
    if (flight.milestone && !reduceMotion) {
      burst.value = withTiming(1, { duration: MOTION.burstMs });
    }
    const id = setTimeout(onDone, MOTION.flightCardMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed]);

  const { from, to } = flight;
  const chipStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {
        opacity: chipOpacity.value,
        transform: [{ translateX: to.x - CHIP / 2 }, { translateY: to.y - CHIP / 2 }],
      };
    }
    const p = flyPoint(t.value, from, to);
    return {
      opacity: chipOpacity.value,
      transform: [
        { translateX: p.x - CHIP / 2 },
        { translateY: p.y - CHIP / 2 + (1 - rise.value) * MOTION.riseY },
        { scale: p.scale * rise.value },
      ],
    };
  });

  const dots = useMemo(() => burstDots(), []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Reanimated.View
        pointerEvents="none"
        style={[styles.chip, chipStyle]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.chipText}>+1</Text>
      </Reanimated.View>

      {landed && flight.milestone && !reduceMotion
        ? dots.map((d, i) => <Dot key={i} to={d} at={to} progress={burst} />)
        : null}

      {landed ? (
        <Reanimated.View
          entering={FadeIn.duration(DURATION.d200).reduceMotion(ReduceMotion.Never)}
          exiting={FadeOut.duration(DURATION.d300)}
          style={[styles.cardSpot, { top: flight.cardTop }]}
          pointerEvents="box-none"
        >
          <FlightCard flight={flight} onDone={onDone} />
        </Reanimated.View>
      ) : null}
    </View>
  );
}

function Dot({
  to,
  at,
  progress,
}: {
  to: Point;
  at: Point;
  progress: { value: number };
}): React.JSX.Element {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: at.x - MOTION.burstDotSize / 2 + to.x * progress.value },
      { translateY: at.y - MOTION.burstDotSize / 2 + to.y * progress.value },
    ],
  }));
  return <Reanimated.View pointerEvents="none" style={[styles.dot, style]} />;
}

/** The glass card: Liquid Glass on iOS 26, a frosted blur elsewhere. */
function FlightCard({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const body = (
    <View style={styles.cardBody} accessible={!flight.cheer} accessibilityLiveRegion="polite">
      <Text style={styles.cardTitle} accessibilityLabel={flight.liveText}>
        {flight.title}
      </Text>
      <Text style={styles.cardLine}>{flight.line}</Text>
      {flight.cheer ? (
        <Pressable
          onPress={() => {
            onDone();
            flight.cheer?.onPress();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cheer, pressed && { opacity: ALPHA.a70 }]}
        >
          <Text style={styles.cheerText}>{flight.cheer.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView style={styles.card} glassEffectStyle="regular" colorScheme="dark">
        {body}
      </GlassView>
    );
  }
  return (
    <BlurView intensity={BLUR_INTENSITY.i40} tint="dark" style={[styles.card, styles.cardEdge]}>
      {body}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CHIP,
    height: CHIP,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f24,
    color: COLORS.offBlack,
  },
  dot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: MOTION.burstDotSize,
    height: MOTION.burstDotSize,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  cardSpot: {
    position: 'absolute',
    right: SPACE.s24,
    maxWidth: SIZE.z360,
  },
  card: {
    borderRadius: RADIUS.r18,
    overflow: 'hidden',
  },
  cardEdge: {
    borderWidth: BORDER_WIDTH.w1,
    borderColor: withAlpha(COLORS.accent, ALPHA.a50),
  },
  cardBody: {
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s16,
    gap: SPACE.s4,
  },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f15,
    color: COLORS.white,
  },
  cardLine: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
    color: COLORS.offWhite,
  },
  cheer: {
    minHeight: SIZE.z44,
    justifyContent: 'center',
  },
  cheerText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
    color: COLORS.accent,
  },
});
