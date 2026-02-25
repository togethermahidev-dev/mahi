import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Animated,
  PanResponder,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useUserStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import ThemeToggle from '@/components/ThemeToggle';

// ─── Streak Badge ─────────────────────────────────────────────────────────────
// Plays a large-to-small spring animation every time the camera tab mounts.
// The number starts at 4× its final rendered size and springs into position.

function StreakBadge({ count }: { count: number }) {
  const scaleAnim   = useRef(new Animated.Value(4)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Fade in quickly so the large text doesn't pop
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      // Spring from 4× → 1× for the "arriving" zoom-in feel
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 16,
        stiffness: 110,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.streakBadge,
        { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
      ]}
    >
      <Text style={styles.streakNumber}>{count}</Text>
      <Text style={styles.streakLabel}>DAY{'\n'}STREAK</Text>
    </Animated.View>
  );
}

// ─── CameraScreen ─────────────────────────────────────────────────────────────

export default function CameraScreen(): React.JSX.Element {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission,    requestMicPermission]    = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const { dark } = useAppTheme();
  const sheetBg = dark ? '#1C1C19' : '#FFFFFF';

  const streakCount = useUserStore((s) => s.profile?.streak_current ?? 0);

  // ─── Swipeable sheet ──────────────────────────────────────────────────────
  // The sheet collapses downward on a vertical swipe but stays sticky — it
  // never fully leaves the screen. PEEK_HEIGHT is the strip that remains
  // visible at the bottom (keeping the shutter button fully on-screen).
  const PEEK_HEIGHT    = 50;
  const sheetHeightRef = useRef(0);
  const isCollapsed    = useRef(false);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  const snapSheet = (collapse: boolean) => {
    const maxCollapse = sheetHeightRef.current - PEEK_HEIGHT;
    isCollapsed.current = collapse;
    Haptics.impactAsync(
      collapse ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    Animated.spring(sheetTranslateY, {
      toValue: collapse ? maxCollapse : 0,
      damping: 22,
      stiffness: 160,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const sheetPanResponder = useRef(
    PanResponder.create({
      // Claim the gesture only for vertical swipes
      onMoveShouldSetPanResponder: (_e, { dx, dy }) =>
        Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8,

      onPanResponderGrant: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        sheetTranslateY.stopAnimation();
      },

      onPanResponderMove: (_e, { dy }) => {
        const maxCollapse = sheetHeightRef.current - PEEK_HEIGHT;
        const base = isCollapsed.current ? maxCollapse : 0;
        const next = Math.max(0, Math.min(base + dy, maxCollapse));
        sheetTranslateY.setValue(next);
      },

      onPanResponderRelease: (_e, { dy, vy }) => {
        const maxCollapse = sheetHeightRef.current - PEEK_HEIGHT;
        const base = isCollapsed.current ? maxCollapse : 0;
        const current = base + dy;
        // Collapse if dragged past 35% of max OR flicked downward fast
        const shouldCollapse =
          current > maxCollapse * 0.35 || vy > 0.5;
        snapSheet(shouldCollapse);
      },
    }),
  ).current;

  // Request camera permission whenever it becomes requestable
  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission();
    }
  }, [cameraPermission?.status]);

  // Request microphone permission whenever it becomes requestable
  useEffect(() => {
    if (micPermission && !micPermission.granted && micPermission.canAskAgain) {
      requestMicPermission();
    }
  }, [micPermission?.status]);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    await cameraRef.current.takePictureAsync({ quality: 0.8 });
  };

  // Still loading — OS hasn't returned permission status yet
  if (!cameraPermission || !micPermission) {
    return <View style={styles.root} />;
  }

  const cameraGranted = cameraPermission.granted;
  const micGranted    = micPermission.granted;

  // One or both permissions are missing
  if (!cameraGranted || !micGranted) {
    // Determine message based on which permission(s) are missing
    let message: string;
    if (!cameraGranted && !micGranted) {
      message = 'Mahi needs access to your camera and microphone to power your fitness experience.';
    } else if (!cameraGranted) {
      message = 'Mahi needs camera access to power your fitness experience.';
    } else {
      message = 'Mahi needs microphone access to record your workout sessions.';
    }

    // Show "Allow Access" if any denied permission can still be requested, else "Open Settings"
    const canAskCamera = !cameraGranted && cameraPermission.canAskAgain;
    const canAskMic    = !micGranted    && micPermission.canAskAgain;
    const canAskAny    = canAskCamera || canAskMic;

    return (
      <View style={styles.root}>
        <View style={styles.cameraRegion}>
          <Text style={styles.deniedMessage}>{message}</Text>
          {!canAskAny && (
            <TouchableOpacity
              style={styles.permissionButton}
              activeOpacity={0.8}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.permissionButtonText}>Open Settings</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.bottomSheet, { backgroundColor: sheetBg }]} />
      </View>
    );
  }

  // Shutter button colours adapt to light/dark mode so the button always
  // contrasts against both the dark camera feed and the themed sheet.
  const shutterRing = dark ? '#FFFFFF' : '#1A1A17';
  const shutterFill = dark ? '#FFFFFF' : '#1A1A17';

  // Both granted — full camera experience
  return (
    <View style={styles.root}>
      {/* Camera region — top 3/4 of screen */}
      <View style={styles.cameraRegion}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        {/* MAHI branding overlaid on camera */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>MAHI</Text>
          <View style={styles.headerRight}>
            <ThemeToggle color="#FFFFFF" size={22} />
          </View>
        </View>

        {/* Streak badge — large-to-small spring animation on mount */}
        <StreakBadge count={streakCount} />
      </View>

      {/* Bottom sheet — swipeable, sticky (never fully dismissed) */}
      <Animated.View
        style={[
          styles.bottomSheet,
          { backgroundColor: sheetBg, transform: [{ translateY: sheetTranslateY }] },
        ]}
        onLayout={({ nativeEvent }) => {
          sheetHeightRef.current = nativeEvent.layout.height;
        }}
        {...sheetPanResponder.panHandlers}
      >
        {/* Shutter floats on top of the sheet boundary — positioned half above, half below */}
        <View style={styles.shutterFloat}>
          <TouchableOpacity
            style={[
              styles.shutterOuter,
              {
                borderColor: shutterRing,
                shadowColor: dark ? '#000000' : '#1A1A17',
              },
            ]}
            activeOpacity={0.82}
            onPress={takePhoto}
          >
            <View style={[styles.shutterInner, { backgroundColor: shutterFill }]} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
  },

  // Camera region — flex 3 = 75% of available space
  cameraRegion: {
    flex: 3,
    backgroundColor: '#111111',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // MAHI header overlaid on camera feed
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 8,
  },
  // Pinned to the right edge of the header row, vertically aligned with MAHI
  headerRight: {
    position: 'absolute',
    right: 24,
    top: Platform.OS === 'ios' ? 60 : 32,
  },

  // Streak badge — absolute top-right, below the MAHI header
  streakBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 80,
    right: 24,
    alignItems: 'center',
  },
  streakNumber: {
    color: '#FFFFFF',
    fontSize: 38,
    fontFamily: 'JosefinSans_700Bold',
    lineHeight: 38,
  },
  streakLabel: {
    color: '#E8E8E3',
    fontSize: 8,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2.5,
    textAlign: 'center',
    opacity: 0.65,
    marginTop: 3,
    lineHeight: 11,
  },

  // Shutter float — full-width container anchored at the top of the sheet,
  // offset upward by half the button height so it straddles the boundary.
  shutterFloat: {
    position: 'absolute',
    top: -36,
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  // Bottom sheet — flex 1 = 25% of available space
  bottomSheet: {
    flex: 1,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Shutter button — ring + inner circle (colours injected inline, mode-aware)
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },

  // Permission denied state
  deniedMessage: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
    opacity: 0.8,
    paddingHorizontal: 32,
  },
  permissionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    paddingVertical: 20,
    paddingHorizontal: 40,
  },
  permissionButtonText: {
    color: '#111111',
    fontSize: 16,
    fontFamily: 'JosefinSans_600SemiBold',
  },
});
