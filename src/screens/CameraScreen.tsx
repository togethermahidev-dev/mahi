import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useUserStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import ThemeToggle from '@/components/ThemeToggle';

// Height of the peek strip at the bottom — shows the top of the next screen.
// Must match PEEK_HEIGHT in VerticalNavigator.tsx.
const PEEK_HEIGHT = 110;

// ─── Streak Badge ─────────────────────────────────────────────────────────────
// Plays a large-to-small spring animation every time the camera screen mounts.
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


  const streakCount = useUserStore((s) => s.profile?.streak_current ?? 0);

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

  // Shutter button colours adapt to light/dark mode so the button always
  // contrasts against both the dark camera feed and the themed peek strip.
  const shutterRing = dark ? '#FFFFFF' : '#1A1A17';
  const shutterFill = dark ? '#FFFFFF' : '#1A1A17';

  // One or both permissions are missing
  if (!cameraGranted || !micGranted) {
    let message: string;
    if (!cameraGranted && !micGranted) {
      message = 'Mahi needs access to your camera and microphone to power your fitness experience.';
    } else if (!cameraGranted) {
      message = 'Mahi needs camera access to power your fitness experience.';
    } else {
      message = 'Mahi needs microphone access to record your workout sessions.';
    }

    const canAskCamera = !cameraGranted && cameraPermission.canAskAgain;
    const canAskMic    = !micGranted    && micPermission.canAskAgain;
    const canAskAny    = canAskCamera || canAskMic;

    return (
      <View style={styles.root}>
        <View style={styles.permissionCenter}>
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
      </View>
    );
  }

  // Both granted — full camera experience
  return (
    <View style={styles.root}>
      {/* Camera fills the entire screen behind all other layers */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* MAHI branding overlaid on camera feed */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MAHI</Text>
        <View style={styles.headerRight}>
          <ThemeToggle color="#FFFFFF" size={22} />
        </View>
      </View>

      {/* Streak badge — large-to-small spring animation on mount */}
      <StreakBadge count={streakCount} />

      {/* Shutter button — floats above the peek strip */}
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

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
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

  // Shutter button — absolute, floats above the peek strip
  shutterFloat: {
    position: 'absolute',
    bottom: PEEK_HEIGHT + 32,
    left: 0,
    right: 0,
    alignItems: 'center',
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
  permissionCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
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
