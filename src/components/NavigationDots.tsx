import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { IconProps } from '@/components/ScreenIcons';
import { COLORS, SPACE, ICON_SIZE, OFFSET, LAYER } from '@/constants/tokens';

interface NavigationDotsProps {
  count: number;
  activeIndex: number;
  dark: boolean;
  icons: React.ComponentType<IconProps>[];
  onDotPress?: (index: number) => void;
}

// Active dot: rounded square with icon inside
// Inactive dot: small pill (same as before)
const ACTIVE_SIZE = 28;
const INACTIVE_SIZE = 6;
const ACTIVE_RADIUS = 10;
const GAP = SPACE.s4; // above and below each dot
const GROWTH = ACTIVE_SIZE - INACTIVE_SIZE;
const PITCH = INACTIVE_SIZE + 2 * GAP; // one small dot and its gaps

/**
 * Every dot is laid out at the active size and shrunk with a scale transform, so the whole
 * animation runs on the native driver. Each dot's vertical position is the sum of the (animated)
 * sizes above it, so the column packs exactly as it did when width/height were animated.
 */
export default function NavigationDots({
  count,
  activeIndex,
  dark,
  icons,
  onDotPress,
}: NavigationDotsProps): React.JSX.Element {
  const dotAnims = useRef<Animated.Value[]>(
    Array.from({ length: count }, (_, i) => new Animated.Value(i === 0 ? 1 : 0))
  ).current;

  useEffect(() => {
    const animations = dotAnims.map((anim, i) =>
      Animated.spring(anim, {
        toValue: i === activeIndex ? 1 : 0,
        damping: 18,
        stiffness: 140,
        useNativeDriver: true,
      })
    );
    Animated.parallel(animations).start();
  }, [activeIndex]);

  const translateYs = useMemo(
    () =>
      dotAnims.map((anim, k) => {
        // Centre of dot k, minus half the layout box (the box sits at top 0).
        const base = k * PITCH + GAP + INACTIVE_SIZE / 2 - ACTIVE_SIZE / 2;
        let y: Animated.AnimatedInterpolation<number> | Animated.AnimatedAddition<number> =
          anim.interpolate({ inputRange: [0, 1], outputRange: [base, base + GROWTH / 2] });
        for (let j = 0; j < k; j++) {
          y = Animated.add(
            y,
            dotAnims[j].interpolate({ inputRange: [0, 1], outputRange: [0, GROWTH] })
          );
        }
        return y;
      }),
    [dotAnims]
  );

  const columnHeight = count * PITCH + GROWTH;
  const dotColor = dark ? COLORS.white : COLORS.offBlack;
  const iconColor = dark ? COLORS.offBlack : COLORS.white; // icon contrasts against the filled dot bg

  return (
    <View style={styles.container} accessibilityRole="tablist">
      <View style={{ width: ACTIVE_SIZE, height: columnHeight }}>
        {dotAnims.map((anim, i) => {
          const scale = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [INACTIVE_SIZE / ACTIVE_SIZE, 1],
          });
          // Radius before scaling: a full circle when small, the rounded square when active.
          const radius = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [ACTIVE_SIZE / 2, ACTIVE_RADIUS],
          });
          const iconOpacity = anim.interpolate({
            inputRange: [0.5, 1],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          });
          const dotOpacity = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.35, 1.0],
          });

          const Icon = icons[i];

          return (
            <Animated.View
              key={i}
              style={[styles.slot, { transform: [{ translateY: translateYs[i] }] }]}
            >
              <Pressable
                onPress={() => onDotPress?.(i)}
                accessibilityRole="tab"
                accessibilityLabel={`Page ${i + 1} of ${count}`}
                accessibilityState={{ selected: i === activeIndex }}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Animated.View
                  style={[
                    styles.dot,
                    {
                      borderRadius: radius,
                      backgroundColor: dotColor,
                      opacity: dotOpacity,
                      transform: [{ scale }],
                    },
                  ]}
                >
                  {/* Icon fades in when dot becomes active */}
                  <Animated.View style={{ opacity: iconOpacity }}>
                    <Icon size={ICON_SIZE.i14} color={iconColor} />
                  </Animated.View>
                </Animated.View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: OFFSET.o16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: LAYER.dots,
  },
  slot: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  pressed: {
    opacity: 0.7,
  },
  dot: {
    width: ACTIVE_SIZE,
    height: ACTIVE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
