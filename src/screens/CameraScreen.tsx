import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  useColorScheme,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useUserStore } from '@/store';

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
  const dark = useColorScheme() === 'dark';
  const sheetBg = dark ? '#1C1C19' : '#FFFFFF';

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

  // Both granted — full camera experience
  return (
    <View style={styles.root}>
      {/* Camera region — top 3/4 of screen */}
      <View style={styles.cameraRegion}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        {/* MAHI branding overlaid on camera */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>MAHI</Text>
        </View>

        {/* Streak badge — large-to-small spring animation on mount */}
        <StreakBadge count={streakCount} />
      </View>

      {/* Bottom sheet — bottom 1/4, rounded top corners */}
      <View style={[styles.bottomSheet, { backgroundColor: sheetBg }]}>
        <TouchableOpacity
          style={styles.shutterOuter}
          activeOpacity={0.85}
          onPress={takePhoto}
        >
          <View style={styles.shutterInner} />
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

  // Bottom sheet — flex 1 = 25% of available space
  bottomSheet: {
    flex: 1,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Shutter button — ring + inner circle
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
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
