/**
 * ThemeToggle
 *
 * Toggles between Light ↔ Dark on each press. Shows the mode you're in as a line sun or moon,
 * like the app's other icons (Apple's own sun and moon where SF Symbols are on).
 *
 * A spring pulse animation plays on every tap (not with Reduce Motion on).
 * It taps as 48 across whatever size it is drawn (Google's 48, more than Apple's 44).
 * Sits on the camera feed so default color is white.
 */

import React, { useRef } from 'react';
import { Pressable, Animated, StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useThemeStore } from '@/store';
import { COLORS, ICON_SIZE, SCALE, SPRING } from '@/constants/tokens';
import { ThemeIcon } from '@/components/ScreenIcons';
import { haptic } from '@/lib/haptics';
import { TAP_AREA, tapSlop } from '@/lib/tapArea';

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

interface ThemeToggleProps {
  /** Icon color — defaults to white for use on the dark camera feed */
  color?: string;
  size?: number;
}

export default function ThemeToggle({
  color = COLORS.white,
  size = ICON_SIZE.i22,
}: ThemeToggleProps): React.JSX.Element {
  const mode = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  const handlePress = () => {
    // A switch is felt as one (the same as every other pick in the app).
    haptic('selection');
    // Compress then spring back — confirms the tap and switches the icon
    if (!reduceMotion) {
      Animated.sequence([
        Animated.spring(scale, {
          toValue: SCALE.s0_68,
          ...SPRING.press,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          ...SPRING.bounce,
          useNativeDriver: true,
        }),
      ]).start();
    }

    cycleMode();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="switch"
      accessibilityLabel="Dark mode"
      accessibilityState={{ checked: mode === 'dark' }}
      hitSlop={tapSlop(size, TAP_AREA.android)}
      style={styles.button}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <ThemeIcon dark={mode === 'dark'} color={color} size={size} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
