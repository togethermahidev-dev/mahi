import React, { useEffect, useRef, useState } from 'react';
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
import { decode } from 'base64-arraybuffer';
import { useAuthStore, useUserStore, useFeedStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { supabase } from '@/lib/supabase';
import { createPost, recordUpload } from '@/api';

// Must match PEEK_HEIGHT in VerticalNavigator.tsx
const PEEK_HEIGHT = 110;

// ─── Streak Badge ─────────────────────────────────────────────────────────────
// Plays a large-to-small spring animation every time the camera screen mounts.

function StreakBadge({ count }: { count: number }) {
  const scaleAnim   = useRef(new Animated.Value(4)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
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

  const [isCapturing, setIsCapturing] = useState(false);

  const userId     = useAuthStore((s) => s.user?.id);
  const profile    = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const streakCount = profile?.streak_current ?? 0;

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission();
    }
  }, [cameraPermission?.status]);

  useEffect(() => {
    if (micPermission && !micPermission.granted && micPermission.canAskAgain) {
      requestMicPermission();
    }
  }, [micPermission?.status]);

  const takePhoto = async () => {
    if (!cameraRef.current || isCapturing || !userId || !profile) return;
    setIsCapturing(true);

    // 1. Capture — brief lock, just reads the frame
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: true });
    setIsCapturing(false);  // release shutter immediately after capture
    if (!photo?.uri || !photo.base64) return;

    const tempId              = `pending_${Date.now()}`;
    const optimisticStreakDay = profile.streak_current + 1;

    // 2. Optimistic: increment streak badge immediately
    setProfile({ ...profile, streak_current: optimisticStreakDay });

    // 3. Optimistic: add post to feed with local URI (renders in FeedScreen instantly)
    useFeedStore.getState().addPending({
      id:         tempId,
      isPending:  true,
      user_id:    userId,
      image_url:  photo.uri,
      caption:    null,
      streak_day: optimisticStreakDay,
      created_at: new Date().toISOString(),
      profiles: {
        id:           userId,
        username:     profile.username,
        display_name: profile.display_name,
        avatar_url:   profile.avatar_url,
      },
    });

    // 4. Background upload — user can navigate away freely
    try {
      const buffer = decode(photo.base64);
      const path   = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

      const { data: storageData, error: storageErr } = await supabase.storage
        .from('posts')
        .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });
      if (storageErr) throw new Error(storageErr.message);

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(storageData.path);

      const { data: postData, error: postErr } = await createPost(
        userId,
        urlData.publicUrl,
        optimisticStreakDay,
      );
      if (postErr) throw postErr;

      const { data: streakResult, error: streakErr } = await recordUpload(userId);
      if (streakErr) throw streakErr;

      // 5. Confirm: swap pending post → real confirmed post
      if (postData) {
        useFeedStore.getState().confirmPending(tempId, {
          ...postData,
          profiles: {
            id:           userId,
            username:     profile.username,
            display_name: profile.display_name,
            avatar_url:   profile.avatar_url,
          },
        } as import('@/api').FeedPost);
      }

      // 6. Sync streak with authoritative RPC values
      if (streakResult) {
        setProfile({
          ...profile,
          streak_current:          streakResult.streak_current,
          streak_highest:          streakResult.streak_highest,
          streak_lowest:           streakResult.streak_lowest,
          streak_last_upload_date: new Date().toISOString().split('T')[0],
        });
      }
    } catch (err) {
      console.error('[takePhoto] background upload failed', err);
      // Rollback: remove pending post + revert streak
      useFeedStore.getState().removePending(tempId);
      setProfile({ ...profile, streak_current: profile.streak_current });
    }
  };

  // Still loading — OS hasn't returned permission status yet
  if (!cameraPermission || !micPermission) {
    return <View style={styles.root} />;
  }

  const cameraGranted = cameraPermission.granted;
  const micGranted    = micPermission.granted;

  // Shutter button colours adapt to light/dark mode
  const shutterRing = dark ? '#FFFFFF' : '#1A1A17';
  const shutterFill = dark ? '#FFFFFF' : '#1A1A17';

  // One or both permissions missing
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

  // Both permissions granted — full camera experience
  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <StreakBadge count={streakCount} />

      {/* Shutter button — floats above the peek strip, disabled while uploading */}
      <View style={styles.shutterFloat}>
        <TouchableOpacity
          style={[
            styles.shutterOuter,
            {
              borderColor: shutterRing,
              shadowColor: dark ? '#000000' : '#1A1A17',
              opacity: isCapturing ? 0.5 : 1,
            },
          ]}
          activeOpacity={0.82}
          disabled={isCapturing}
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
  shutterFloat: {
    position: 'absolute',
    bottom: PEEK_HEIGHT + 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
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
