import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '@/store/toastStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { loadScreens } from '@/lib/screensModule';
import { toastLines } from '@/lib/toast';
import { TYPOGRAPHY } from '@/constants/typography';
import {
  COLORS,
  ALPHA,
  DURATION,
  ELEVATION,
  OFFSET,
  RADIUS,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  WAIT,
} from '@/constants/tokens';

/**
 * Single, app-wide toast sink. Subscribes to toastStore and renders a small toast with a
 * fade/slide animation whenever `message != null`, kept clear of the phone's tab bar (and at the
 * top while the post preview is up). It can carry one button. Auto-dismisses after `durationMs`
 * (an action toast stays the longest while a screen reader is on). Mounted once near the app root.
 *
 * On iPhone builds with react-native-screens (build 11+) it is drawn in its own window above
 * everything, so a toast raised under an open sheet (comments, notifications, the tag screen) is
 * still seen. Build 10 and Android: as before, under any open sheet.
 */
export function ToastHost(): React.JSX.Element | null {
  const message = useToastStore((s) => s.message);
  const durationMs = useToastStore((s) => s.durationMs);
  const action = useToastStore((s) => s.action);
  const room = useToastStore((s) => s.room);
  const hide = useToastStore((s) => s.hide);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  // More lines at large text, so a toast isn't cut off mid-sentence.
  const lines = toastLines(useWindowDimensions().fontScale);

  // Slides in from the edge it sits on.
  const from = room.top ? -OFFSET.o12 : OFFSET.o12;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(from)).current;

  useEffect(() => {
    if (message == null) return;
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // VoiceOver / TalkBack read the toast out, since it never takes focus.
    AccessibilityInfo.announceForAccessibility(
      action ? `${message} ${action.label}, button.` : message
    );

    translateY.setValue(from);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: DURATION.d180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: DURATION.d180, useNativeDriver: true }),
    ]).start();

    const startTimer = (ms: number) => {
      timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: DURATION.d180, useNativeDriver: true }),
          Animated.timing(translateY, {
            toValue: from,
            duration: DURATION.d180,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) hide();
        });
      }, ms);
    };

    if (action) {
      // A button needs time to be found by touch reading: the most time with a screen reader.
      AccessibilityInfo.isScreenReaderEnabled()
        .then((on) => {
          if (!stale) startTimer(on ? Math.max(durationMs, WAIT.toastMax) : durationMs);
        })
        .catch(() => {
          if (!stale) startTimer(durationMs);
        });
    } else {
      startTimer(durationMs);
    }

    return () => {
      stale = true;
      if (timer) clearTimeout(timer);
    };
    // `from` follows `room.top`, which is read when the toast appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, durationMs, action, hide, opacity, translateY]);

  if (message == null) return null;

  // Above the tab bar when it shows, and above the Camera's shutter row and lens switch on the
  // Camera page; at the top, under the preview's ×, while composing.
  const place = room.top
    ? { top: insets.top + OFFSET.o48 + SIZE.z36 + SPACE.s12 }
    : room.camera > 0
      ? { bottom: room.tabBar + room.camera + SPACE.s8 }
      : { bottom: room.tabBar > 0 ? room.tabBar + SPACE.s8 : insets.bottom + OFFSET.o14 };

  const toast = (
    <View pointerEvents={action ? 'box-none' : 'none'} style={[styles.container, place]}>
      <Animated.View
        style={[
          styles.toast,
          action && styles.toastWithAction,
          {
            backgroundColor: colors.offBlack,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Text
          style={[styles.text, action && styles.textWithAction, { color: colors.offWhite }]}
          numberOfLines={lines}
        >
          {message}
        </Text>
        {action ? (
          <Pressable
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            onPress={() => {
              action.onPress();
              hide();
            }}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );

  // iPhone with react-native-screens: its own window, above sheets and pop-ups.
  const FullWindowOverlay = Platform.OS === 'ios' ? loadScreens()?.FullWindowOverlay : undefined;
  if (FullWindowOverlay) {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
        {toast}
      </FullWindowOverlay>
    );
  }
  return toast;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: SPACE.s24,
  },
  toast: {
    maxWidth: SIZE.z420,
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s18,
    borderRadius: RADIUS.r12,
    // Minimal shadow scrim — allowed hardcoded value.
    shadowColor: COLORS.black,
    shadowOpacity: ALPHA.a25,
    shadowRadius: SHADOW_BLUR.b8,
    shadowOffset: { width: 0, height: SIZE.z2 },
    elevation: ELEVATION.e4,
  },
  toastWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
    paddingVertical: SPACE.s4,
    paddingRight: SPACE.s4,
  },
  text: {
    ...TYPOGRAPHY.bodyMedium,
    textAlign: 'center',
  },
  textWithAction: {
    flexShrink: 1,
    textAlign: 'left',
    paddingVertical: SPACE.s8,
  },
  action: {
    minHeight: SIZE.z44,
    paddingHorizontal: SPACE.s12,
    justifyContent: 'center',
  },
  actionText: {
    ...TYPOGRAPHY.labelStrong,
    color: COLORS.accent,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
});
