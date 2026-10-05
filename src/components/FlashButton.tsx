/**
 * The camera's flash button: each tap goes off → on → auto. On the selfie side "on" lights the
 * screen instead (see `flashMode` in src/lib/cameraCapture.ts). The camera is always dark, so the
 * icon is always white. Icon drawn in the app's 24-unit stroke style (as ScreenIcons).
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { flashValueLabel, type FlashChoice } from '@/lib/cameraCapture';
import { COLORS, ALPHA, SIZE, STROKE } from '@/constants/tokens';

const BOLT = 'M13 2L3 14h9l-1 8 10-12h-9l1-8z';
/** A narrower bolt that leaves room for the small A of "auto". */
const BOLT_NARROW = 'M11 2L3 13h7l-1 7 8-10h-7l1-8z';

export function FlashIcon({
  choice,
  size,
  color,
}: {
  choice: FlashChoice;
  size: number;
  color: string;
}) {
  const stroke = {
    stroke: color,
    strokeWidth: STROKE.s2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {choice === 'off' ? (
        <>
          <Path d="M12.41 6.75L13 2l-2.43 2.92" {...stroke} />
          <Path d="M18.57 12.91L21 10h-5.34" {...stroke} />
          <Path d="M8 8l-5 6h9l-1 8 5-6" {...stroke} />
          <Line x1="1" y1="1" x2="23" y2="23" {...stroke} />
        </>
      ) : choice === 'on' ? (
        <Path d={BOLT} fill={color} {...stroke} />
      ) : (
        <>
          <Path d={BOLT_NARROW} {...stroke} />
          <Path d="M17.5 23l2.75-7 2.75 7M18.6 20.5h3.3" {...stroke} />
        </>
      )}
    </Svg>
  );
}

export default function FlashButton({
  choice,
  onPress,
  disabled,
}: {
  choice: FlashChoice;
  onPress: () => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Flash"
      accessibilityValue={{ text: flashValueLabel(choice) }}
      accessibilityHint="Changes the flash: off, on or auto."
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled ? ALPHA.a30 : 1 },
        pressed && { opacity: ALPHA.a70 },
      ]}
    >
      <FlashIcon choice={choice} size={SIZE.z24} color={COLORS.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same footprint as the flip button it mirrors across the shutter.
  button: {
    width: SIZE.z44,
    height: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
