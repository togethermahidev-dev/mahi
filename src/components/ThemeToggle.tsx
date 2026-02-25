/**
 * ThemeToggle
 *
 * Cycles through Light → Dark → System on each press.
 * Each mode has a fitness-flavoured SVG icon:
 *   Dumbbell    — Light mode  (compact, daytime training)
 *   Barbell     — Dark mode   (heavy, night session)
 *   Heartbeat   — System/Auto (pulse = reactive to environment)
 *
 * A spring pulse animation plays on every tap.
 * Sits on the camera feed so default color is white.
 */

import React, { useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { useThemeStore } from '@/store';
import type { ThemeMode } from '@/store/themeStore';

// ─── SVG Icons ────────────────────────────────────────────────────────────────

interface IconProps {
  color: string;
  size:  number;
}

/** Dumbbell — Light mode. Compact, daytime training energy. */
function DumbbellIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Short center bar */}
      <Line x1="8" y1="12" x2="16" y2="12" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {/* Left weight plate — two vertical lines */}
      <Line x1="5.5" y1="9"   x2="5.5" y2="15"  stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1="7.5" y1="8"   x2="7.5" y2="16"  stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {/* Right weight plate — two vertical lines */}
      <Line x1="16.5" y1="8"  x2="16.5" y2="16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1="18.5" y1="9"  x2="18.5" y2="15" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Barbell — Dark mode. Heavy Olympic bar, night session. */
function BarbellIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Full-width bar */}
      <Line x1="1.5" y1="12" x2="22.5" y2="12" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {/* Left outer plate */}
      <Line x1="3"   y1="8.5" x2="3"   y2="15.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {/* Left inner plate */}
      <Line x1="6"   y1="7.5" x2="6"   y2="16.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {/* Right inner plate */}
      <Line x1="18"  y1="7.5" x2="18"  y2="16.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {/* Right outer plate */}
      <Line x1="21"  y1="8.5" x2="21"  y2="15.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Heartbeat / ECG pulse — System mode. Reactive to your environment like a pulse. */
function HeartbeatIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12h4l2 -4.5L11 17l3 -9.5L16.5 12H22"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Mode → Icon map ──────────────────────────────────────────────────────────

const MODE_ICON: Record<ThemeMode, (props: IconProps) => React.JSX.Element> = {
  light:  DumbbellIcon,
  dark:   BarbellIcon,
  system: HeartbeatIcon,
};

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

interface ThemeToggleProps {
  /** Icon color — defaults to white for use on the dark camera feed */
  color?: string;
  size?:  number;
}

export default function ThemeToggle({
  color = '#FFFFFF',
  size  = 22,
}: ThemeToggleProps): React.JSX.Element {
  const mode      = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);
  const scale     = useRef(new Animated.Value(1)).current;

  const Icon = MODE_ICON[mode];

  const handlePress = () => {
    // Compress then spring back — confirms the tap and switches the icon
    Animated.sequence([
      Animated.spring(scale, {
        toValue:     0.68,
        speed:       60,
        bounciness:  0,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue:    1,
        damping:    10,
        stiffness:  200,
        mass:       0.6,
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
    alignItems:     'center',
    justifyContent: 'center',
  },
});
