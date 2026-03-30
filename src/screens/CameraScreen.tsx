import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Animated,
  Alert,
  Dimensions,
  Modal,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import Svg, { Path } from 'react-native-svg';
import { decode } from 'base64-arraybuffer';
import { useAuthStore, useUserStore, useFeedStore, useProfilePostsStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { supabase } from '@/lib/supabase';
import { createPost, recordUpload } from '@/api';

// Must match PEEK_HEIGHT in VerticalNavigator.tsx
const PEEK_HEIGHT = 110;

// ─── Midnight Countdown ───────────────────────────────────────────────────────
// Shows HH:MM:SS remaining until local midnight, ticking every second.
// Calls onUnlock() when it reaches zero so the camera re-enables without a reload.

function getMsUntilMidnight(): number {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // next local midnight
  return next.getTime() - now.getTime();
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function MidnightCountdown({ onUnlock }: { onUnlock: () => void }) {
  const [remaining, setRemaining] = useState(getMsUntilMidnight);

  useEffect(() => {
    const id = setInterval(() => {
      const ms = getMsUntilMidnight();
      setRemaining(ms);
      if (ms <= 0) {
        clearInterval(id);
        onUnlock();
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.postedOverlay}>
      <Text style={styles.postedTitle}>STREAK SECURED</Text>
      <Text style={styles.countdownTimer}>{formatCountdown(remaining)}</Text>
      <Text style={styles.postedSub}>until your next post unlocks</Text>
    </View>
  );
}

// ─── Streak Badge ─────────────────────────────────────────────────────────────

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

// ─── Flip Icon ────────────────────────────────────────────────────────────────

function FlipIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1 4v6h6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M23 20v-6h-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Photo Preview ────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CapturedPhoto {
  uri: string;
  base64: string;
}

interface PhotoPreviewProps {
  photo: CapturedPhoto | null;
  onDiscard: () => void;
  onPost: (photo: CapturedPhoto) => void;
  isUploading: boolean;
}

function PhotoPreview({ photo, onDiscard, onPost, isUploading }: PhotoPreviewProps) {
  const slideAnim    = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [modalOpen, setModalOpen] = useState(false);
  // Hold the last non-null photo so the image stays visible during slide-out
  const frozenPhoto  = useRef<CapturedPhoto | null>(null);
  if (photo !== null) frozenPhoto.current = photo;

  const hasPhoto = photo !== null;

  useEffect(() => {
    if (hasPhoto) {
      setModalOpen(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    } else {
      // Slide out, then close modal and clear the frozen ref
      Animated.spring(slideAnim, {
        toValue: SCREEN_WIDTH,
        damping: 22,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true,
      }).start(() => {
        frozenPhoto.current = null;
        setModalOpen(false);
      });
    }
  }, [hasPhoto]);

  const handleDiscard = () => {
    Alert.alert(
      'Discard photo?',
      '',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onDiscard },
      ],
    );
  };

  return (
    <Modal
      visible={modalOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDiscard}
    >
      <Animated.View
        style={[
          styles.previewPanel,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        {frozenPhoto.current && (
          <Image
            source={{ uri: frozenPhoto.current.uri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        )}

        {/* Discard — top right */}
        <TouchableOpacity
          style={styles.discardButton}
          activeOpacity={0.8}
          onPress={handleDiscard}
          disabled={isUploading}
        >
          <Text style={styles.discardX}>✕</Text>
        </TouchableOpacity>

        {/* Post — bottom center */}
        <View style={styles.postButtonFloat}>
          <TouchableOpacity
            style={[styles.postButton, isUploading && { opacity: 0.5 }]}
            activeOpacity={0.82}
            disabled={isUploading}
            onPress={() => frozenPhoto.current && onPost(frozenPhoto.current)}
          >
            <Text style={styles.postButtonText}>POST</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── CameraScreen ─────────────────────────────────────────────────────────────

export default function CameraScreen(): React.JSX.Element {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission,    requestMicPermission]    = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const { dark } = useAppTheme();

  const [facing, setFacing]             = useState<'back' | 'front'>('back');
  const [isCapturing, setIsCapturing]   = useState(false);
  const [isUploading, setIsUploading]   = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);

  const userId     = useAuthStore((s) => s.user?.id);
  const profile    = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const streakCount = profile?.streak_current ?? 0;

  // Has the user already posted today (local date)?
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const hasPostedToday = profile?.streak_last_upload_date === today;

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

  // Step 1: capture only — sets preview state, no upload yet
  const capturePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    // Capture without base64:true — that flag bypasses orientation processing on some devices,
    // causing the Image component to display the photo rotated. We read base64 separately instead.
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    setIsCapturing(false);
    if (!photo?.uri) return;
    const base64 = await FileSystem.readAsStringAsync(photo.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    setCapturedPhoto({ uri: photo.uri, base64 });
  };

  // Step 2: user confirmed POST — run upload + streak + feed
  const uploadPhoto = async (photo: CapturedPhoto) => {
    if (!userId || !profile) return;
    setIsUploading(true);

    const tempId              = `pending_${Date.now()}`;
    const optimisticStreakDay = profile.streak_current + 1;

    // Optimistic: increment streak badge immediately
    setProfile({ ...profile, streak_current: optimisticStreakDay });

    // Optimistic: add post to feed with local URI
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

    // Clear preview immediately so camera returns while upload runs in background
    setCapturedPhoto(null);
    setIsUploading(false);

    // `today` is already derived at component scope (YYYY-MM-DD local)

    let storagePath: string | null = null;

    try {
      const buffer = decode(photo.base64);
      storagePath  = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

      const { data: storageData, error: storageErr } = await supabase.storage
        .from('posts')
        .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: false });
      if (storageErr) throw new Error(storageErr.message);

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(storageData.path);

      // Record streak first — so streak_day on the post is authoritative
      const { data: streakResult, error: streakErr } = await recordUpload(userId, today);
      if (streakErr) throw streakErr;

      const confirmedStreakDay = streakResult?.streak_current ?? optimisticStreakDay;

      const { data: postData, error: postErr } = await createPost(
        userId,
        urlData.publicUrl,
        confirmedStreakDay,
      );
      if (postErr) throw postErr;

      // Confirm: swap pending post → real confirmed post
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

        useProfilePostsStore.getState().addPost(postData);
      }

      // Sync streak using authoritative RPC values — read fresh store state to avoid stale closure
      if (streakResult) {
        const current = useUserStore.getState().profile;
        if (current) {
          setProfile({
            ...current,
            streak_current:          streakResult.streak_current,
            streak_highest:          streakResult.streak_highest,
            streak_lowest:           streakResult.streak_lowest,
            streak_last_upload_date: today,
          });
        }
      }
    } catch (err) {
      console.error('[uploadPhoto] upload failed', err);
      // Rollback optimistic UI
      useFeedStore.getState().removePending(tempId);
      const current = useUserStore.getState().profile;
      if (current) setProfile({ ...current, streak_current: profile.streak_current });
      // Clean up orphaned storage object
      if (storagePath) {
        supabase.storage.from('posts').remove([storagePath]).catch(() => {});
      }
    }
  };

  const handleDiscard = () => {
    setCapturedPhoto(null);
  };

  // Still loading — OS hasn't returned permission status yet
  if (!cameraPermission || !micPermission) {
    return <View style={styles.root} />;
  }

  const cameraGranted = cameraPermission.granted;
  const micGranted    = micPermission.granted;

  const shutterRing = dark ? '#FFFFFF' : '#1A1A17';
  const shutterFill = dark ? '#FFFFFF' : '#1A1A17';
  const flipColor   = '#FFFFFF';

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
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      <StreakBadge count={streakCount} />

      {/* Already posted today — countdown to local midnight unlock */}
      {hasPostedToday && (
        <MidnightCountdown onUnlock={() => {
          // Recalculate today — it's now a new day, profile date no longer matches
          // The hasPostedToday derived value will re-evaluate on next render
          setProfile({ ...useUserStore.getState().profile! });
        }} />
      )}

      {/* Bottom controls: [flip] [shutter] [spacer] */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.flipButton, hasPostedToday && { opacity: 0.3 }]}
          activeOpacity={0.75}
          onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
          disabled={isCapturing || hasPostedToday}
        >
          <FlipIcon color={flipColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.shutterOuter,
            {
              borderColor: shutterRing,
              shadowColor: dark ? '#000000' : '#1A1A17',
              opacity: isCapturing || hasPostedToday ? 0.3 : 1,
            },
          ]}
          activeOpacity={0.82}
          disabled={isCapturing || hasPostedToday}
          onPress={capturePhoto}
        >
          <View style={[styles.shutterInner, { backgroundColor: shutterFill }]} />
        </TouchableOpacity>

        {/* Spacer — keeps shutter centred */}
        <View style={styles.flipButton} />
      </View>

      {/* Photo preview — slides in from the right as its own Modal layer */}
      <PhotoPreview
        photo={capturedPhoto}
        onDiscard={handleDiscard}
        onPost={uploadPhoto}
        isUploading={isUploading}
      />
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
  // ── Already posted today ──────────────────────────────────────────────────
  postedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  postedTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 4,
    textAlign: 'center',
  },
  countdownTimer: {
    color: '#FFFFFF',
    fontSize: 48,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 6,
    textAlign: 'center',
  },
  postedSub: {
    color: '#E8E8E3',
    fontSize: 12,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
    opacity: 0.55,
    letterSpacing: 1,
  },
  // ── Bottom controls row ───────────────────────────────────────────────────
  controlsRow: {
    position: 'absolute',
    bottom: PEEK_HEIGHT + 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
  },
  flipButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  // ── Photo preview ─────────────────────────────────────────────────────────
  previewPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#111111',
  },
  discardButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 80,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardX: {
    color: '#111111',
    fontSize: 14,
    fontFamily: 'JosefinSans_600SemiBold',
    lineHeight: 16,
  },
  postButtonFloat: {
    position: 'absolute',
    bottom: PEEK_HEIGHT + 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  postButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    paddingVertical: 20,
    paddingHorizontal: 56,
  },
  postButtonText: {
    color: '#111111',
    fontSize: 16,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
  },
  // ── Permissions ───────────────────────────────────────────────────────────
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
