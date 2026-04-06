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
  PanResponder,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import Svg, { Path } from 'react-native-svg';
import { decode } from 'base64-arraybuffer';
import { useAuthStore, useUserStore, useFeedStore, useProfilePostsStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { supabase } from '@/lib/supabase';
import { createPost, recordUpload } from '@/api';
import { Sentry } from '@/lib/sentry';

// Must match PEEK_HEIGHT in VerticalNavigator.tsx
const PEEK_HEIGHT = 110;

// ─── Midnight Countdown ───────────────────────────────────────────────────────

function getMsUntilMidnight(): number {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
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
    <BlurView intensity={60} tint="dark" style={styles.postedOverlay}>
      <Text style={styles.postedTitle}>STREAK SECURED</Text>
      <Text style={styles.countdownTimer}>{formatCountdown(remaining)}</Text>
      <Text style={styles.postedSub}>until your next post unlocks</Text>
    </BlurView>
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

// ─── Types ────────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CapturedPhoto {
  uri: string;
  base64: string;
}

// ─── Dual Photo Preview ───────────────────────────────────────────────────────
// Full-screen primary + small draggable pip.
// Rear (POV) is primary by default; front selfie is the pip.
// Tap pip → swap. Hold + drag pip → reposition.

const PIP_W = 130;
const PIP_H = 170;
const PIP_MARGIN = 16;

interface DualPhotoPreviewProps {
  frontPhoto: CapturedPhoto | null;
  rearPhoto:  CapturedPhoto | null;
  onDiscard:  () => void;
  onPost:     (front: CapturedPhoto, rear: CapturedPhoto) => void;
  isUploading: boolean;
}

function DualPhotoPreview({
  frontPhoto,
  rearPhoto,
  onDiscard,
  onPost,
  isUploading,
}: DualPhotoPreviewProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [modalOpen, setModalOpen] = useState(false);

  // Which photo is the full-screen background: 'rear' or 'front'
  const [primaryFacing, setPrimaryFacing] = useState<'rear' | 'front'>('rear');

  // Pip position — bottom-left by default
  const pipX = useRef(PIP_MARGIN);
  const pipY = useRef(SCREEN_HEIGHT - PIP_H - PIP_MARGIN - PEEK_HEIGHT - 80);
  const pipAnim = useRef(new Animated.ValueXY({ x: pipX.current, y: pipY.current })).current;

  // Frozen refs so image stays visible during slide-out animation
  const frozenFront = useRef<CapturedPhoto | null>(null);
  const frozenRear  = useRef<CapturedPhoto | null>(null);
  if (frontPhoto !== null) frozenFront.current = frontPhoto;
  if (rearPhoto  !== null) frozenRear.current  = rearPhoto;

  const hasPhotos = frontPhoto !== null && rearPhoto !== null;

  useEffect(() => {
    if (hasPhotos) {
      setModalOpen(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(slideAnim, {
        toValue: SCREEN_WIDTH,
        damping: 22,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true,
      }).start(() => {
        frozenFront.current = null;
        frozenRear.current  = null;
        setModalOpen(false);
        // Reset pip position for next time
        pipX.current = PIP_MARGIN;
        pipY.current = SCREEN_HEIGHT - PIP_H - PIP_MARGIN - PEEK_HEIGHT - 80;
        pipAnim.setValue({ x: pipX.current, y: pipY.current });
        setPrimaryFacing('rear');
      });
    }
  }, [hasPhotos]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        pipAnim.setOffset({ x: pipX.current, y: pipY.current });
        pipAnim.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pipAnim.x, dy: pipAnim.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: (_, gestureState) => {
        pipAnim.flattenOffset();
        // Clamp within screen bounds
        const rawX = pipX.current + gestureState.dx;
        const rawY = pipY.current + gestureState.dy;
        pipX.current = Math.max(PIP_MARGIN, Math.min(rawX, SCREEN_WIDTH  - PIP_W - PIP_MARGIN));
        pipY.current = Math.max(PIP_MARGIN, Math.min(rawY, SCREEN_HEIGHT - PIP_H - PIP_MARGIN));
        pipAnim.setValue({ x: pipX.current, y: pipY.current });
      },
    }),
  ).current;

  const handlePipTap = () => {
    setPrimaryFacing(f => (f === 'rear' ? 'front' : 'rear'));
  };

  const handleDiscard = () => {
    Alert.alert('Discard photos?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
    ]);
  };

  const primaryUri = primaryFacing === 'rear'
    ? frozenRear.current?.uri
    : frozenFront.current?.uri;

  const pipUri = primaryFacing === 'rear'
    ? frozenFront.current?.uri
    : frozenRear.current?.uri;

  return (
    <Modal
      visible={modalOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDiscard}
    >
      <Animated.View
        style={[styles.previewPanel, { transform: [{ translateX: slideAnim }] }]}
      >
        {/* Primary full-screen photo */}
        {primaryUri && (
          <Image
            source={{ uri: primaryUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        )}

        {/* Pip — draggable, tap to swap */}
        {pipUri && (
          <Animated.View
            style={[styles.pip, { transform: pipAnim.getTranslateTransform() }]}
            {...panResponder.panHandlers}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handlePipTap}
              style={StyleSheet.absoluteFillObject}
            >
              <Image
                source={{ uri: pipUri }}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
                resizeMode="cover"
              />
            </TouchableOpacity>
          </Animated.View>
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
            onPress={() => {
              if (frozenFront.current && frozenRear.current) {
                onPost(frozenFront.current, frozenRear.current);
              }
            }}
          >
            <Text style={styles.postButtonText}>POST</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── CameraScreen ─────────────────────────────────────────────────────────────

type CaptureState = 'idle' | 'front' | 'switching' | 'rear';

export default function CameraScreen(): React.JSX.Element {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission,    requestMicPermission]    = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const { dark } = useAppTheme();

  const [facing,       setFacing]       = useState<'back' | 'front'>('front');
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [isUploading,  setIsUploading]  = useState(false);
  const [frontPhoto,   setFrontPhoto]   = useState<CapturedPhoto | null>(null);
  const [rearPhoto,    setRearPhoto]    = useState<CapturedPhoto | null>(null);

  const userId     = useAuthStore((s) => s.user?.id);
  const profile    = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const streakCount = profile?.streak_current ?? 0;

  const today = new Date().toLocaleDateString('en-CA');
  const hasPostedToday = profile?.streak_last_upload_date === today;

  const isRestDay = (() => {
    const routine = profile?.fitness_routine;
    if (!routine) return false;
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    return !routine.split(',').includes(dayName);
  })();

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

  // Helper: take a photo from whatever camera is currently active
  const takePhoto = async (): Promise<CapturedPhoto | null> => {
    if (!cameraRef.current) return null;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!photo?.uri) return null;
    // Re-encode to bake EXIF orientation into pixel data
    const { uri: normalizedUri } = await manipulateAsync(photo.uri, [], {
      compress: 0.8,
      format: SaveFormat.JPEG,
    });
    const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { uri: normalizedUri, base64 };
  };

  // Sequential capture: front first, flip, then rear ~800ms later
  const captureSequence = async () => {
    if (captureState !== 'idle') return;

    // Step 1: ensure we're on front camera and take the selfie
    setCaptureState('front');
    setFacing('front');
    // Brief pause for camera to settle after potential facing change
    await new Promise(r => setTimeout(r, 300));
    const front = await takePhoto();
    if (!front) {
      setCaptureState('idle');
      return;
    }

    // Step 2: flip to rear and wait for it to initialise
    setCaptureState('switching');
    setFacing('back');
    await new Promise(r => setTimeout(r, 800));

    // Step 3: take the rear POV shot
    setCaptureState('rear');
    const rear = await takePhoto();
    setCaptureState('idle');
    if (!rear) return;

    setFrontPhoto(front);
    setRearPhoto(rear);
  };

  // Upload both photos, create post
  const uploadPhotos = async (front: CapturedPhoto, rear: CapturedPhoto) => {
    if (!userId || !profile) return;
    setIsUploading(true);

    const tempId              = `pending_${Date.now()}`;
    const optimisticStreakDay = profile.streak_current + 1;

    setProfile({ ...profile, streak_current: optimisticStreakDay });

    // Optimistic feed entry — use rear as primary display image
    useFeedStore.getState().addPending({
      id:            tempId,
      isPending:     true,
      user_id:       userId,
      image_url:     rear.uri,
      pov_image_url: front.uri,
      caption:       null,
      streak_day:    optimisticStreakDay,
      created_at:    new Date().toISOString(),
      profiles: {
        id:           userId,
        username:     profile.username,
        display_name: profile.display_name,
        avatar_url:   profile.avatar_url,
      },
    });

    // Dismiss preview immediately so camera returns while upload runs
    setFrontPhoto(null);
    setRearPhoto(null);
    setIsUploading(false);

    let rearStoragePath:  string | null = null;
    let frontStoragePath: string | null = null;

    try {
      const rearBuffer  = decode(rear.base64);
      const frontBuffer = decode(front.base64);
      const timestamp   = Date.now();
      rearStoragePath   = `${userId}/${timestamp}_${Math.random().toString(36).slice(2)}.jpg`;
      frontStoragePath  = `${userId}/${timestamp}_${Math.random().toString(36).slice(2)}_pov.jpg`;

      // Upload both in parallel
      const [rearUpload, frontUpload] = await Promise.all([
        supabase.storage.from('posts').upload(rearStoragePath,  rearBuffer,  { contentType: 'image/jpeg', upsert: false }),
        supabase.storage.from('posts').upload(frontStoragePath, frontBuffer, { contentType: 'image/jpeg', upsert: false }),
      ]);
      if (rearUpload.error)  throw new Error(rearUpload.error.message);
      if (frontUpload.error) throw new Error(frontUpload.error.message);

      const rearUrl  = supabase.storage.from('posts').getPublicUrl(rearUpload.data.path).data.publicUrl;
      const frontUrl = supabase.storage.from('posts').getPublicUrl(frontUpload.data.path).data.publicUrl;

      const { data: streakResult, error: streakErr } = await recordUpload(userId, today);
      if (streakErr) throw streakErr;

      const confirmedStreakDay = streakResult?.streak_current ?? optimisticStreakDay;

      const { data: postData, error: postErr } = await createPost({
        userId,
        imageUrl:    rearUrl,
        povImageUrl: frontUrl,
        streakDay:   confirmedStreakDay,
      });
      if (postErr) throw postErr;

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
      console.error('[uploadPhotos] upload failed', err);
      Sentry.captureException(err, {
        tags: { flow: 'camera', action: 'upload' },
        extra: { userId },
      });
      useFeedStore.getState().removePending(tempId);
      const current = useUserStore.getState().profile;
      if (current) setProfile({ ...current, streak_current: profile.streak_current });
      // Clean up any orphaned storage objects
      const toRemove = [rearStoragePath, frontStoragePath].filter(Boolean) as string[];
      if (toRemove.length) supabase.storage.from('posts').remove(toRemove).catch(() => {});
    }
  };

  const handleDiscard = () => {
    setFrontPhoto(null);
    setRearPhoto(null);
  };

  if (!cameraPermission || !micPermission) {
    return <View style={styles.root} />;
  }

  const cameraGranted = cameraPermission.granted;
  const micGranted    = micPermission.granted;
  const shutterRing   = dark ? '#FFFFFF' : '#1A1A17';
  const shutterFill   = dark ? '#FFFFFF' : '#1A1A17';
  const flipColor     = '#FFFFFF';

  const isCapturing = captureState !== 'idle';

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

  // Capture state label shown while sequencing
  const captureLabel =
    captureState === 'front'     ? 'SELFIE...' :
    captureState === 'switching' ? 'SWITCHING...' :
    captureState === 'rear'      ? 'POV...' : null;

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      <StreakBadge count={streakCount} />

      {isRestDay && !hasPostedToday && (
        <Text style={styles.restDayLabel}>REST DAY</Text>
      )}

      {/* Capture progress overlay */}
      {captureLabel && (
        <View style={styles.captureLabelWrap}>
          <Text style={styles.captureLabel}>{captureLabel}</Text>
        </View>
      )}

      {hasPostedToday && (
        <MidnightCountdown onUnlock={() => {
          setProfile({ ...useUserStore.getState().profile! });
        }} />
      )}

      <View style={styles.controlsRow}>
        <View style={styles.flipButton} />

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
          onPress={captureSequence}
        >
          <View style={[styles.shutterInner, { backgroundColor: shutterFill }]} />
        </TouchableOpacity>

        {/* Spacer */}
        <View style={styles.flipButton} />
      </View>

      <DualPhotoPreview
        frontPhoto={frontPhoto}
        rearPhoto={rearPhoto}
        onDiscard={handleDiscard}
        onPost={uploadPhotos}
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
  restDayLabel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 170 : 142,
    right: 24,
    color: '#E8E8E3',
    fontSize: 10,
    fontFamily: 'JosefinSans_400Regular_Italic',
    letterSpacing: 2,
    opacity: 0.5,
    textAlign: 'center',
  },
  captureLabelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  captureLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 4,
    opacity: 0.9,
  },
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
  // ── Preview panel ─────────────────────────────────────────────────────────
  previewPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#111111',
  },
  pip: {
    position: 'absolute',
    width: PIP_W,
    height: PIP_H,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
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
