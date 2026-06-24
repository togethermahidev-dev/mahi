/**
 * ThemeToggle
 *
 * Toggles between Light ↔ Dark on each press.
 *   Blue Cloud + Sun — Light mode  (bright, daytime)
 *   Moon            — Dark mode   (night)
 *
 * A spring pulse animation plays on every tap.
 * Sits on the camera feed so default color is white.
 */

import React, { useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { useThemeStore } from '@/store';
import type { ThemeMode } from '@/store/themeStore';

// ─── SVG Icons ────────────────────────────────────────────────────────────────

interface IconProps {
  color: string;
  size: number;
}

/** Blue Cloud with Sun peeking — Light mode. */
function CloudSunIcon({ size }: IconProps) {
  const blue = '#4FA8FF';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Sun peeking behind the cloud — top-right */}
      <G>
        <Circle cx="17" cy="8" r="2.4" fill="#FFC93B" stroke="#FFC93B" strokeWidth={1.2} />
        {/* Sun rays */}
        <Path
          d="M17 3.5v1.4 M17 11.1v1.4 M21.5 8h-1.4 M13.9 8h-1.4 M20.18 4.82l-0.99 0.99 M14.82 11.19l-0.99 0.99 M20.18 11.18l-0.99 -0.99 M14.82 4.81l-0.99 -0.99"
          stroke="#FFC93B"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </G>
      {/* Cloud — fills the bottom-left, slightly overlapping the sun */}
      <Path
        d="M7 19h10.5a3.5 3.5 0 0 0 0.6 -6.95 A5 5 0 0 0 8.1 11.2 A4 4 0 0 0 7 19z"
        fill={blue}
        stroke={blue}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Crescent Moon — Dark mode. */
function MoonIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.5 14.3A8 8 0 0 1 9.7 3.5a0.6 0.6 0 0 0 -0.82 -0.72 9.5 9.5 0 1 0 12.34 12.34 0.6 0.6 0 0 0 -0.72 -0.82z"
        fill={color}
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Mode → Icon map ──────────────────────────────────────────────────────────

const MODE_ICON: Record<ThemeMode, (props: IconProps) => React.JSX.Element> = {
  light: CloudSunIcon,
  dark: MoonIcon,
};

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

interface ThemeToggleProps {
  /** Icon color — defaults to white for use on the dark camera feed */
  color?: string;
  size?: number;
}

export default function ThemeToggle({
  color = '#FFFFFF',
  size = 22,
}: ThemeToggleProps): React.JSX.Element {
  const mode = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);
  const scale = useRef(new Animated.Value(1)).current;

  const Icon = MODE_ICON[mode];

  const handlePress = () => {
    // Compress then spring back — confirms the tap and switches the icon
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 0.68,
        speed: 60,
        bounciness: 0,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 10,
        stiffness: 200,
        mass: 0.6,
        useNativeDriver: true,
      }),
    ]).start();

    cycleMode();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={1}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={styles.button}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon color={color} size={size} />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
