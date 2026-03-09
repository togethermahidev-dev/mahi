import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface NavigationDotsProps {
  count: number;
  activeIndex: number;
  dark: boolean;
}

export default function NavigationDots({
  count,
  activeIndex,
  dark,
}: NavigationDotsProps): React.JSX.Element {
  const dotAnims = useRef<Animated.Value[]>(
    Array.from({ length: count }, (_, i) => new Animated.Value(i === 0 ? 1 : 0)),
  ).current;

  useEffect(() => {
    const animations = dotAnims.map((anim, i) =>
      Animated.spring(anim, {
        toValue: i === activeIndex ? 1 : 0,
        damping: 18,
        stiffness: 140,
        useNativeDriver: false, // height is not a transform property
      }),
    );
    Animated.parallel(animations).start();
  }, [activeIndex]);

  const dotColor = dark ? '#FFFFFF' : '#1A1A17';

  return (
    <View style={styles.container} pointerEvents="none">
      {dotAnims.map((anim, i) => {
        const height = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 20],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.35, 1.0],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                height,
                opacity,
                backgroundColor: dotColor,
              },
            ]}
          />
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
    width: 6,
    borderRadius: 3,
    marginVertical: 4,
  },
});
