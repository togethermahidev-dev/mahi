/**
 * The way up to the feed, over the shutter (owner, 2026-10-09): no pill, just FEED in capitals
 * fading to faint, with two up-chevrons each side that rise and fade on a loop, the lower one
 * first, so it reads as "swipe up for your feed". A tap opens the feed too. The capitals are the
 * owner's own call, like the MAHI wordmark; the rest of the camera stays sentence case.
 *
 * Drawn with react-native-svg, so the word and the chevrons share one fade with no new native
 * module. Reduce Motion: the chevrons stay still and fully shown. When it shows and where it
 * sits: src/lib/feedCue.ts.
 *
 * Worklet rule (13.08 / 13.19 crashed on launch): the animated styles read only numbers and the
 * shared clock, held in local consts.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { PressScale } from '@/components/Motion';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  COLORS,
  FONT_SIZE,
  ICON_SIZE,
  MOTION,
  OFFSET,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  STROKE,
  TRACKING,
} from '@/constants/tokens';

/** How wide the cue is: a chevron column each side of the word, a small gap between. */
export const FEED_CUE_WIDTH = ICON_SIZE.i14 * 2 + SPACE.s4 * 2 + SIZE.z48;

/** The 36-tall cue taps as 44, like the camera's pills. */
const SLOP = { top: OFFSET.o4, bottom: OFFSET.o4 };

export default function FeedCue({ onPress }: { onPress: () => void }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  // One clock, 0 → 1 over a rise, on a loop; each chevron reads it at its own lag.
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(clock);
      clock.value = 0;
      return;
    }
    clock.value = withRepeat(
      withTiming(1, { duration: MOTION.feedCue.riseMs, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(clock);
  }, [reduceMotion, clock]);

  return (
    <PressScale
      style={styles.cue}
      onPress={onPress}
      hitSlop={SLOP}
      accessibilityRole="button"
      accessibilityLabel="Feed"
      accessibilityHint="Shows your feed"
    >
      <Chevrons clock={clock} still={reduceMotion} />
      <Svg width={SIZE.z48} height={SIZE.z20}>
        <Fade id="feedCueWord" />
        {/* Centred on its box; letter spacing also follows the last letter, so half of it moves
            the word back to the middle. */}
        <SvgText
          x={SIZE.z48 / 2 + TRACKING.t3 / 2}
          y={SIZE.z20 / 2}
          textAnchor="middle"
          alignmentBaseline="central"
          fontFamily={FONTS.bold}
          fontSize={FONT_SIZE.f13}
          letterSpacing={TRACKING.t3}
          fill="url(#feedCueWord)"
        >
          FEED
        </SvgText>
      </Svg>
      <Chevrons clock={clock} still={reduceMotion} />
    </PressScale>
  );
}

/** White fading to faint, top to bottom: the word and every chevron share it. */
function Fade({ id }: { id: string }): React.JSX.Element {
  return (
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={COLORS.white} stopOpacity={1} />
        <Stop offset="1" stopColor={COLORS.white} stopOpacity={ALPHA.a35} />
      </LinearGradient>
    </Defs>
  );
}

/** Two up-chevrons, one over the other: the lower rises into the upper's place as it fades. */
function Chevrons({
  clock,
  still,
}: {
  clock: SharedValue<number>;
  still: boolean;
}): React.JSX.Element {
  const lag = MOTION.feedCue.staggerMs / MOTION.feedCue.riseMs;
  return (
    <View style={styles.chevrons}>
      <Chevron clock={clock} lag={0} still={still} style={styles.lower} />
      <Chevron clock={clock} lag={lag} still={still} style={styles.upper} />
    </View>
  );
}

/** One chevron: it shows at its place, brightens as it rises, and is gone by the top. */
function Chevron({
  clock,
  lag,
  still,
  style,
}: {
  clock: SharedValue<number>;
  /** Its share of a rise behind the clock. */
  lag: number;
  still: boolean;
  style: StyleProp<ViewStyle>;
}): React.JSX.Element {
  // Numbers only for the worklet (see the rule above).
  const rise = MOTION.feedCue.rise;
  const peakAt = MOTION.feedCue.peakAt;
  const anim = useAnimatedStyle(() => {
    if (still) return { opacity: 1, transform: [{ translateY: 0 }] };
    // Where this chevron is in its own rise: 0 at its place, 1 risen and gone.
    const u = (clock.value + 1 - lag) % 1;
    return {
      opacity: interpolate(u, [0, peakAt, 1], [0, 1, 0]),
      transform: [{ translateY: -u * rise }],
    };
  });
  return (
    <Reanimated.View style={[styles.chevron, style, anim]}>
      <Svg width={ICON_SIZE.i14} height={SIZE.z8} viewBox="0 0 14 8">
        <Fade id="feedCueChevron" />
        <Path
          d="M2 6.5L7 1.5L12 6.5"
          stroke="url(#feedCueChevron)"
          strokeWidth={STROKE.s2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  cue: {
    height: SIZE.z36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s4,
    // A soft shadow so the white still reads over a bright scene (iPhone draws it from the
    // letters themselves; Android draws none on a clear view, and the fade keeps it light).
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: SIZE.z1 },
    shadowOpacity: ALPHA.a50,
    shadowRadius: SHADOW_BLUR.b3,
  },
  // As tall as the word's box; the two chevrons sit 5 apart, centred on the letters.
  chevrons: {
    width: ICON_SIZE.i14,
    height: SIZE.z20,
  },
  chevron: {
    position: 'absolute',
    left: 0,
  },
  upper: {
    top: OFFSET.o3,
  },
  lower: {
    top: OFFSET.o8,
  },
});
