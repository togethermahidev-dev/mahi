/**
 * "Switch to camera" (owner, 2026-10-09: "when the feed reaches the top have a floating arrow
 * circular pill that say switch to camera"): floats over the full-screen feed at its first post;
 * a tap brings the camera back, and it hints that a pull down there does too. It fades with the
 * swipe, so it's never there mid-morph. When it shows: switchPillShown / switchPillOpacity
 * (src/lib/feedPull.ts).
 *
 * Worklet rule (13.08 / 13.19 crashed on launch): the animated style reads only the shared value
 * and a boolean held in local consts.
 */
import React from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { PressScale } from '@/components/Motion';
import { switchPillOpacity } from '@/lib/feedPull';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  FONT_SIZE,
  ICON_SIZE,
  RADIUS,
  SIZE,
  SPACE,
  STROKE,
} from '@/constants/tokens';

export default function SwitchCameraPill({
  shown,
  morph,
  onPress,
  style,
}: {
  shown: boolean;
  /** The camera to feed morph: 0 = camera, 1 = feed. */
  morph: SharedValue<number>;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const fade = useAnimatedStyle(() => ({ opacity: switchPillOpacity(morph.value, shown) }));
  return (
    <Reanimated.View
      style={[styles.spot, style, fade]}
      pointerEvents={shown ? 'box-none' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
    >
      <PressScale
        style={styles.pill}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Switch to camera"
        accessibilityHint="Brings the camera back"
      >
        {/* The camera is above the feed: an arrow up. */}
        <Svg width={ICON_SIZE.i14} height={ICON_SIZE.i14} viewBox="0 0 14 14">
          <Path
            d="M7 12.5V1.5M2 6.5L7 1.5L12 6.5"
            stroke={COLORS.offBlack}
            strokeWidth={STROKE.s2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.label}>Switch to camera</Text>
      </PressScale>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  spot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Same colours as the camera circle beside the bell.
  pill: {
    minHeight: SIZE.z36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
    paddingHorizontal: SPACE.s14,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.offWhite,
  },
  label: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
  },
});
