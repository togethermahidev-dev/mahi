import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useToastStore } from '@/store/toastStore';
import { useAppTheme } from '@/hooks/useAppTheme';

/**
 * Single, app-wide toast sink. Subscribes to toastStore and renders a small
 * bottom toast with a fade/slide animation whenever `message != null`.
 * Auto-dismisses after `durationMs`. Mounted once near the app root.
 */
export function ToastHost(): React.JSX.Element | null {
  const message = useToastStore((s) => s.message);
  const durationMs = useToastStore((s) => s.durationMs);
  const hide = useToastStore((s) => s.hide);
  const { colors } = useAppTheme();

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (message == null) return;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 12,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) hide();
      });
    }, durationMs);

    return () => clearTimeout(timer);
  }, [message, durationMs, hide, opacity, translateY]);

  if (message == null) return null;

  return (
    <View pointerEvents="none" style={styles.container}>
      <Animated.View
        style={[
          styles.toast,
          {
            backgroundColor: colors.offBlack,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Text style={[styles.text, { color: colors.offWhite }]} numberOfLines={2}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  toast: {
    maxWidth: 420,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    // Minimal shadow scrim — allowed hardcoded value.
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
