import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { IconProps } from '@/components/ScreenIcons';

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
        useNativeDriver: false, // width/height are not transform properties
      })
    );
    Animated.parallel(animations).start();
  }, [activeIndex]);

  const dotColor = dark ? '#FFFFFF' : '#1A1A17';
  const iconColor = dark ? '#1A1A17' : '#FFFFFF'; // icon contrasts against the filled dot bg

  return (
    <View style={styles.container}>
      {dotAnims.map((anim, i) => {
        const size = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [INACTIVE_SIZE, ACTIVE_SIZE],
        });
        const radius = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [INACTIVE_SIZE / 2, ACTIVE_RADIUS],
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
          <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => onDotPress?.(i)}>
            <Animated.View
              style={[
                styles.dot,
                {
                  width: size,
                  height: size,
                  borderRadius: radius,
                  backgroundColor: dotColor,
                  opacity: dotOpacity,
                },
              ]}
            >
              {/* Icon fades in when dot becomes active */}
              <Animated.View style={{ opacity: iconOpacity }}>
                <Icon size={14} color={iconColor} />
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  dot: {
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
