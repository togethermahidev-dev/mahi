import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Linking,
  Platform,
  Animated,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  Pressable,
  FlatList,
  Share,
  AccessibilityInfo,
  ActivityIndicator,
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { haptic, hapticSequence, postedMoments } from '@/lib/haptics';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Accelerometer } from 'expo-sensors';
import Svg, { Path } from 'react-native-svg';
import { decode } from 'base64-arraybuffer';
import {
  useAuthStore,
  useUserStore,
  useFeedStore,
  useProfilePostsStore,
  useTagStore,
} from '@/store';
import { useToastStore } from '@/store/toastStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { randomUUID } from 'expo-crypto';
import { track } from '@/lib/analytics';
import {
  createPost,
  getTaggableFriends,
  removePostPhotos,
  uploadPostMedia,
  type TaggedUser,
  type FeedPost,
  type TaggableFriend,
  type PostInvite,
} from '@/api';
import TaggedBubbleStack from '@/components/TaggedBubbleStack';
import OpenTagsBanner from '@/components/OpenTagsBanner';
import PointsBadge from '@/components/PointsBadge';
import { CameraIcon } from '@/components/ScreenIcons';
import { pointsCount, pointsValue, postedToast } from '@/lib/mahiPoints';
import KeyboardInset from '@/components/KeyboardInset';
import FlashButton from '@/components/FlashButton';
import FocusSquare, { FOCUS_SQUARE_SIZE, type FocusTap } from '@/components/FocusSquare';
import CapturePipGuide from '@/components/CapturePipGuide';
import PostVideo, { SoundButton } from '@/components/PostVideo';
import InviteStep from '@/components/InviteStep';
import InviteShareSheet from '@/components/InviteShareSheet';
import TagSlotsSheet from '@/components/TagSlotsSheet';
import { getTagSlots } from '@/api/tagSlots';
import { inviteBlockedReason, postRefusal, type ScreenSlot } from '@/lib/tagSlots';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useVideoPosts } from '@/hooks/useVideoPosts';
import { usePageSize, useRailRoom, useTabBarRoom } from '@/hooks/useChrome';
import { cameraLift } from '@/lib/nativeTabs';
import {
  HOLD_TO_RECORD_MS,
  VIDEO_RECORDING,
  discardTitle,
  recordingLabel,
  secondsLeft,
  shutterIntent,
  shutterLabel,
  type MediaType,
  type ShutterPress,
} from '@/lib/videoPosts';
import {
  PHOTO_CAPTURE,
  flashMode,
  focusPoint,
  focusSquareOrigin,
  nextFlash,
  tapFocusAvailable,
  type FlashChoice,
} from '@/lib/cameraCapture';
import { answersATag, reactivePostingGate } from '@/lib/reactivePosting';
import { nudgeLabel } from '@/lib/tagNudge';
import { cantTagReason } from '@/lib/tagRules';
import { inviteList, inviteShareMessage, markInvite, type InviteItem } from '@/lib/inviteShare';
import { tagSheetStep } from '@/lib/inviteStep';
import {
  captureLabel as captureLabelFor,
  pipGuide,
  previewPipRestTop,
  type CaptureState,
} from '@/lib/captureGuide';
import { Sentry } from '@/lib/sentry';
import { requestLocationPermission, getCurrentLocation } from '@/lib/location';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  CAMERA,
  DURATION,
  ELEVATION,
  FONT_SIZE,
  ICON_SIZE,
  LAYOUT,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SCALE,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  SPRING,
  STROKE,
  TRACKING,
  VIEWER,
  WAIT,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/lib/themeColors';

/** Said on the camera and in the toast when there's no open tag to answer. */
const NO_TAGS_TITLE = 'No tags to answer';

/** The flash setting, kept for this app session only (never saved on the phone). */
let flashThisSession: FlashChoice = 'off';

// ─── Points counter ───────────────────────────────────────────────────────────

/** Top of the top-right corner items (points counter, discard ✕): just below the status bar. */
function topRightY(insetTop: number): number {
  return insetTop + OFFSET.o48;
}

/**
 * Your Mahi points, in the top-right corner of the live camera. `null` until your profile has
 * loaded: a muted dash, never a 0 that then changes. The number lands (zoom + fade) the first
 * time it's known, and pops a little when it goes up; with Reduce Motion it only fades.
 */
function PointsCounter({ count }: { count: number | null }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const scaleAnim = useRef(new Animated.Value(reduceMotion ? 1 : SCALE.s4)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const lastCount = useRef<number | null>(null);
  const known = count !== null;

  // The landing: once, when the number is first known (the dash just fades in before that).
  useEffect(() => {
    if (!known) {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: DURATION.d180,
        useNativeDriver: true,
      }).start();
      return;
    }
    opacityAnim.setValue(0);
    if (reduceMotion) scaleAnim.setValue(1);
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: DURATION.d180,
        useNativeDriver: true,
      }),
      ...(reduceMotion
        ? []
        : [Animated.spring(scaleAnim, { toValue: 1, ...SPRING.land, useNativeDriver: true })]),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known]);

  // A point earned: a small pop from the number (none with Reduce Motion).
  useEffect(() => {
    const before = lastCount.current;
    lastCount.current = count;
    if (count === null || before === null || count <= before || reduceMotion) return;
    scaleAnim.setValue(SCALE.s1_3);
    Animated.spring(scaleAnim, { toValue: 1, ...SPRING.land, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    <Animated.View
      style={[
        styles.pointsCounter,
        { top: topRightY(insets.top), transform: [{ scale: scaleAnim }], opacity: opacityAnim },
      ]}
      accessible
      accessibilityLabel={known ? `Mahi points: ${pointsCount(count)}` : 'Mahi points loading'}
    >
      <Text style={[styles.pointsNumber, !known && { color: themeColors(true).muted }]}>
        {pointsValue(count)}
      </Text>
      <Text style={styles.pointsLabel}>Points</Text>
    </Animated.View>
  );
}

// ─── Flip Icon ────────────────────────────────────────────────────────────────

function FlipIcon({ color }: { color: string }) {
  return (
    <Svg width={SIZE.z24} height={SIZE.z24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1 4v6h6"
        stroke={color}
        strokeWidth={STROKE.s2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M23 20v-6h-6"
        stroke={color}
        strokeWidth={STROKE.s2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"
        stroke={color}
        strokeWidth={STROKE.s2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Lens selection (0.5× ultra-wide) ─────────────────────────────────────────
// expo-camera exposes `selectedLens` (string, iOS only) for picking a physical
// lens, and `zoom` (0..1) on both platforms. There is NO true sub-1× zoom: zoom
// only narrows the FoV, so 0.5× (ultra-wide) is achievable ONLY by selecting the
// ultra-wide lens. On iOS that lens is reported by getAvailableLensesAsync /
// onAvailableLensesChanged as 'builtInUltraWideCamera'. On Android the lens list
// comes back empty, so the helper returns null and the caller hides the control —
// gracefully defaulting to 1× rather than faking a wide shot via zoom.
//
// This ONE helper is the entire iOS↔Android divergence: callers only ever ask
// "is there an ultra-wide lens, and what's its id?" — they never branch on OS.
function findUltraWideLens(lenses: string[]): string | null {
  // iOS device-type identifiers (see Apple AVCaptureDevice.DeviceType). Match
  // case-insensitively on the substring so we tolerate both the bare type and
  // any vendor-prefixed variants the native module may surface.
  const match = lenses.find((l) => l.toLowerCase().includes('ultrawide'));
  return match ?? null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** The lens switch's bottom edge: above the shutter row (the shutter is 72 tall). */
const LENS_TOGGLE_BOTTOM = OFFSET.o32 + OFFSET.o72 + OFFSET.o20;

/** One captured shot: a photo, or (flag `video-posts`) a video of up to 15 s. */
interface CapturedPhoto {
  kind: MediaType;
  uri: string;
  /** The photo's bytes; '' for a video, which is read from its file only when uploading. */
  base64: string;
  /**
   * Captured pixel width / height. > 1 means the shot was taken landscape
   * (device turned sideways while the UI stayed portrait-locked — see
   * `responsiveOrientationWhenOrientationLocked` on <CameraView>). Defaults to
   * the portrait-ish ~0.75 a sensor yields when held upright. Used to render the
   * preview PIP in the photo's true aspect instead of forcing a portrait box.
   */
  aspectRatio: number;
}

// ─── Dual Photo Preview ───────────────────────────────────────────────────────
// Full-screen primary + small draggable pip.
// Rear (your view) is primary by default; front selfie is the pip.
// Tap pip → swap. Hold + drag pip → reposition.

const PIP_W = SIZE.z130;
const PIP_H = SIZE.z170;
const PIP_MARGIN = SPACE.s16;
/** A recorded video's shape for the preview window (upright phone video). */
const VIDEO_ASPECT = 9 / 16;

/**
 * A preview pill on glass, with NavRail's fallbacks: Liquid Glass on iOS 26+, a frosted blur on
 * older iPhones, a tinted fill on Android. `active` fills it with the accent (location on).
 */
function GlassPill({ active, children }: { active?: boolean; children: React.ReactNode }) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        style={styles.captionPill}
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor={active ? COLORS.accent : undefined}
      >
        {children}
      </GlassView>
    );
  }
  const fill = [styles.captionPill, styles.captionPillFill, active && styles.locationPillActive];
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={BLUR_INTENSITY.i40} tint="dark" style={fill}>
        {children}
      </BlurView>
    );
  }
  return <View style={fill}>{children}</View>;
}

/** `others`: slots filled by an invite or a link (flag `tag-slots`). */
function tagPillLabel(tagged: TaggedUser[], others = 0): string {
  if (tagged.length === 0 && others === 0) return '+ Tag people';
  if (tagged.length === 0) return others === 1 ? '1 invite' : `${others} invites`;
  const more = tagged.length - 1 + others;
  return more > 0 ? `@${tagged[0].username} +${more}` : `@${tagged[0].username}`;
}

interface DualPhotoPreviewProps {
  frontPhoto: CapturedPhoto | null;
  rearPhoto: CapturedPhoto | null;
  onDiscard: () => void;
  onPost: (front: CapturedPhoto, rear: CapturedPhoto) => void;
  isUploading: boolean;
  caption: string;
  onCaptionChange: (v: string) => void;
  taggedUsers: TaggedUser[];
  onTaggedUsersChange: (users: TaggedUser[]) => void;
  /** Slots filled by an invite link for someone not on Mahi. */
  inviteCount: number;
  onInviteCountChange: (n: number) => void;
  /** Flag `tag-slots`: the tag screen fills slots before posting (links, in-app invites). */
  slotsOn: boolean;
  slots: ScreenSlot[];
  onSlotsChange: (slots: ScreenSlot[]) => void;
  /** Tags this post needs before POST unlocks (server enforces the same rule). */
  requiredTags: number;
  /** Per-post location toggle. Default OFF — explicit opt-in, never silent. */
  locationEnabled: boolean;
  /** Toggle the per-post location pill. On the first enable this triggers the
   *  native permission prompt (asked once, cached) and may settle back to OFF
   *  if the user denies. */
  onToggleLocation: () => void;
}

function DualPhotoPreview({
  frontPhoto,
  rearPhoto,
  onDiscard,
  onPost,
  isUploading,
  caption,
  onCaptionChange,
  taggedUsers,
  onTaggedUsersChange,
  inviteCount,
  onInviteCountChange,
  slotsOn,
  slots,
  onSlotsChange,
  requiredTags,
  locationEnabled,
  onToggleLocation,
}: DualPhotoPreviewProps) {
  const maxTags = useTagStore((s) => s.maxTags);
  const insets = useSafeAreaInsets();
  // An invite fills a slot just as a friend does.
  const tagsMissing = Math.max(0, requiredTags - taggedUsers.length - inviteCount - slots.length);
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [modalOpen, setModalOpen] = useState(false);

  // Which photo is the full-screen background: 'rear' or 'front'
  const [primaryFacing, setPrimaryFacing] = useState<'rear' | 'front'>('rear');
  // Video posts: the big video's sound. Every preview starts muted.
  const [previewMuted, setPreviewMuted] = useState(true);

  // Frozen refs so image stays visible during slide-out animation. Declared
  // here (before the PIP layout math) because pipH below reads the pip photo's
  // aspect ratio off frozenFront/frozenRear.
  const frozenFront = useRef<CapturedPhoto | null>(null);
  const frozenRear = useRef<CapturedPhoto | null>(null);
  if (frontPhoto !== null) frozenFront.current = frontPhoto;
  if (rearPhoto !== null) frozenRear.current = rearPhoto;

  // The PIP shows whichever photo is NOT the full-screen one. Its width is
  // fixed (PIP_W); its height tracks that photo's true aspect so a landscape
  // capture (taken with the phone sideways while the UI stayed portrait) renders
  // wide-and-short instead of being center-cropped into a tall portrait box.
  // Height is clamped to [PIP_W*0.6 .. PIP_H] so a very wide shot can't collapse
  // to a sliver and a portrait shot can't exceed the original box. Falls back to
  // the original portrait PIP_H when aspect is unknown.
  const pipPhoto = primaryFacing === 'rear' ? frozenFront.current : frozenRear.current;
  const pipAspect = pipPhoto?.aspectRatio && pipPhoto.aspectRatio > 0 ? pipPhoto.aspectRatio : null;
  const pipH = pipAspect
    ? Math.round(Math.max(PIP_W * LAYOUT.pipMinHeight, Math.min(PIP_W / pipAspect, PIP_H)))
    : PIP_H;

  // Inline tag + caption pill row sits just above POST. The PIP is kept
  // strictly above this row (and thus above POST too) via a hard clamp on
  // the pan/snap Y bounds — leaves room to add more pills inline later
  // without any dodge animation.
  const pillRowW = Math.min(SCREEN_WIDTH - SPACE.s32, SIZE.z360);
  const pillH = SIZE.z36;
  const pillGap = SPACE.s12;
  const postBtnH = SIZE.z64;
  const pillsB = SCREEN_HEIGHT - SPACE.s32 - postBtnH - pillGap;
  const pillsT = pillsB - pillH;
  // Lowest Y the PIP's top-left is allowed to reach: 12pt above the pill row.
  // Uses the dynamic pipH so a shorter (landscape) PIP can sit a touch lower
  // while still clearing the pill row and POST.
  const pipMaxY = previewPipRestTop(SCREEN_HEIGHT, pipH);
  // Anchor for the TaggedBubbleStack in the preview — sit above the pill
  // row with a 16pt breathing gap. Derived so it can't drift from pills.
  const bubbleStackBottom = SCREEN_HEIGHT - pillsT + SPACE.s16;

  // Pip position — bottom-left of the PIP-safe region by default.
  const defaultPipX = PIP_MARGIN;
  const defaultPipY = pipMaxY;
  const pipTransX = useSharedValue<number>(defaultPipX);
  const pipTransY = useSharedValue(defaultPipY);
  const pipStartX = useSharedValue<number>(defaultPipX);
  const pipStartY = useSharedValue(defaultPipY);
  const pipScaleVal = useSharedValue(1);

  // Primary (full-screen) photo pinch-zoom state. scale in [MIN..MAX]; transX/Y
  // pan the zoomed image but are clamped so it can never be dragged fully
  // off-screen (see clampPrimaryPan). A double-tap resets all three to neutral.
  const PRIMARY_MIN_SCALE = 1;
  const primaryScale = useSharedValue(1);
  const primaryTransX = useSharedValue(0);
  const primaryTransY = useSharedValue(0);
  // Gesture-start anchors so successive pinch/pan deltas compose correctly.
  const primaryStartScale = useSharedValue(1);
  const primaryStartTransX = useSharedValue(0);
  const primaryStartTransY = useSharedValue(0);

  // Reset zoom to neutral (used on swap + on close). Worklet-safe.
  const resetPrimaryZoom = (animated: boolean) => {
    'worklet';
    if (animated) {
      primaryScale.value = withSpring(1, SPRING.settle);
      primaryTransX.value = withSpring(0, SPRING.settle);
      primaryTransY.value = withSpring(0, SPRING.settle);
    } else {
      primaryScale.value = 1;
      primaryTransX.value = 0;
      primaryTransY.value = 0;
    }
  };

  const hasPhotos = frontPhoto !== null && rearPhoto !== null;
  type ActiveSheet = 'none' | 'caption' | 'tag';
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
  // When non-null, the tag sheet was opened by typing `@` at this index in
  // the caption. On commit we splice `username ` right after that `@`, then
  // reopen the caption sheet. When null, the tag sheet was opened via the
  // tag pill and commits/cancels go straight back to 'none'.
  const [captionAtIndex, setCaptionAtIndex] = useState<number | null>(null);

  // Reduce Motion: the preview fades in and out instead of sliding (owner approved 2026-10-05).
  const reduceMotion = useReducedMotion();
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (hasPhotos) {
      setModalOpen(true);
      if (reduceMotion) {
        slideAnim.setValue(0);
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: DURATION.d200,
          useNativeDriver: true,
        }).start();
        return;
      }
      fadeAnim.setValue(1);
      Animated.spring(slideAnim, {
        toValue: 0,
        ...SPRING.page,
        useNativeDriver: true,
      }).start();
    } else {
      const close = reduceMotion
        ? Animated.timing(fadeAnim, {
            toValue: 0,
            duration: DURATION.d200,
            useNativeDriver: true,
          })
        : Animated.spring(slideAnim, {
            toValue: SCREEN_WIDTH,
            ...SPRING.page,
            useNativeDriver: true,
          });
      close.start(() => {
        slideAnim.setValue(SCREEN_WIDTH);
        fadeAnim.setValue(1);
        frozenFront.current = null;
        frozenRear.current = null;
        setModalOpen(false);
        setActiveSheet('none');
        // Reset pip position for next time
        pipTransX.value = defaultPipX;
        pipTransY.value = defaultPipY;
        pipStartX.value = defaultPipX;
        pipStartY.value = defaultPipY;
        pipScaleVal.value = 1;
        // Reset primary zoom for next time.
        primaryScale.value = 1;
        primaryTransX.value = 0;
        primaryTransY.value = 0;
        setPrimaryFacing('rear');
        setPreviewMuted(true);
      });
    }
  }, [hasPhotos]);

  const pipPanGesture = Gesture.Pan()
    .activateAfterLongPress(DURATION.d150)
    .onStart(() => {
      'worklet';
      pipStartX.value = pipTransX.value;
      pipStartY.value = pipTransY.value;
      pipScaleVal.value = withSpring(SCALE.s1_1, SPRING.lift);
      runOnJS(haptic)('pickUp');
    })
    .onUpdate((e) => {
      'worklet';
      const rawX = pipStartX.value + e.translationX;
      const rawY = pipStartY.value + e.translationY;
      pipTransX.value = Math.max(PIP_MARGIN, Math.min(rawX, SCREEN_WIDTH - PIP_W - PIP_MARGIN));
      // Hard clamp Y so the PIP can never slide under the pill row or POST.
      pipTransY.value = Math.max(PIP_MARGIN, Math.min(rawY, pipMaxY));
    })
    .onEnd(() => {
      'worklet';
      // Snap to nearest of the two allowed corners (top-left / top-right of
      // the PIP-safe region). The bottom bound is the pill row, not the
      // screen, so "bottom corners" here mean pipMaxY, not screen bottom.
      const midX = (SCREEN_WIDTH - PIP_W) / 2;
      const midY = (PIP_MARGIN + pipMaxY) / 2;
      const snapX = pipTransX.value < midX ? PIP_MARGIN : SCREEN_WIDTH - PIP_W - PIP_MARGIN;
      const snapY = pipTransY.value < midY ? PIP_MARGIN : pipMaxY;
      pipTransX.value = withSpring(snapX, SPRING.snap);
      pipTransY.value = withSpring(snapY, SPRING.snap);
      pipScaleVal.value = withSpring(1, SPRING.lift);
    });

  const pipTapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      // Reset zoom so the newly-promoted photo starts at 1x (recommended).
      resetPrimaryZoom(false);
      setPrimaryFacing((f) => (f === 'rear' ? 'front' : 'rear'));
    });

  const pipGesture = Gesture.Race(pipPanGesture, pipTapGesture);

  const pipAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: pipTransX.value },
      { translateY: pipTransY.value },
      { scale: pipScaleVal.value },
    ],
  }));

  // ── Primary photo pinch-to-zoom + pan ─────────────────────────────────────
  // Image fills the screen (resizeMode:cover). When scaled by `s`, the extra
  // width/height beyond the screen is (s-1)*SCREEN_*; the image can travel half
  // of that in each direction before an edge pulls inside the screen. Clamp pan
  // to that range so the photo can never be dragged fully off-screen.
  const clampPrimaryPan = (tx: number, ty: number, s: number) => {
    'worklet';
    const maxX = ((Math.max(s, 1) - 1) * SCREEN_WIDTH) / 2;
    const maxY = ((Math.max(s, 1) - 1) * SCREEN_HEIGHT) / 2;
    return {
      x: Math.max(-maxX, Math.min(tx, maxX)),
      y: Math.max(-maxY, Math.min(ty, maxY)),
    };
  };

  const primaryPinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      primaryStartScale.value = primaryScale.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = Math.max(
        PRIMARY_MIN_SCALE,
        Math.min(primaryStartScale.value * e.scale, VIEWER.pinchMax)
      );
      primaryScale.value = next;
      // Re-clamp pan against the new scale so shrinking re-centers the edges.
      const c = clampPrimaryPan(primaryTransX.value, primaryTransY.value, next);
      primaryTransX.value = c.x;
      primaryTransY.value = c.y;
    })
    .onEnd(() => {
      'worklet';
      if (primaryScale.value <= PRIMARY_MIN_SCALE) {
        resetPrimaryZoom(true);
      }
    });

  // Pan the zoomed image. Only meaningful while zoomed in; at 1x the clamp
  // pins translation to 0 so it's a no-op and won't fight the PiP/swap.
  const primaryPanGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      'worklet';
      primaryStartTransX.value = primaryTransX.value;
      primaryStartTransY.value = primaryTransY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const c = clampPrimaryPan(
        primaryStartTransX.value + e.translationX,
        primaryStartTransY.value + e.translationY,
        primaryScale.value
      );
      primaryTransX.value = c.x;
      primaryTransY.value = c.y;
    });

  const primaryDoubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      resetPrimaryZoom(true);
      runOnJS(haptic)('tick');
    });

  // Compose: pinch + pan run together (Simultaneous) so a two-finger pinch can
  // also drag; double-tap is Exclusive (a completed double-tap shouldn't also
  // register as the start of a pan). This stack lives on the full-screen photo's
  // own GestureDetector; the PiP keeps its separate detector on the view painted
  // on top, so touches on the PiP route to the PiP gesture and touches on the
  // background route here — the two never compete for the same touch.
  const primaryGesture = Gesture.Exclusive(
    primaryDoubleTapGesture,
    Gesture.Simultaneous(primaryPinchGesture, primaryPanGesture)
  );

  const primaryAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: primaryTransX.value },
      { translateY: primaryTransY.value },
      { scale: primaryScale.value },
    ],
  }));

  // Two photos keep today's wording; a video is named.
  const discardQuestion = discardTitle(
    frozenRear.current?.kind ?? 'photo',
    frozenFront.current?.kind ?? 'photo'
  );

  const handleDiscard = () => {
    Alert.alert(discardQuestion, '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
    ]);
  };

  const primaryShot = primaryFacing === 'rear' ? frozenRear.current : frozenFront.current;
  const pipShot = primaryFacing === 'rear' ? frozenFront.current : frozenRear.current;
  const primaryUri = primaryShot?.uri;
  const pipUri = pipShot?.uri;
  // Videos play, looping, while the preview is up. Sound only from the big one, muted at first.
  const previewPlaying = modalOpen && hasPhotos;

  return (
    <Modal
      visible={modalOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDiscard}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[
            styles.previewPanel,
            { transform: [{ translateX: slideAnim }], opacity: fadeAnim },
          ]}
        >
          {/* Primary full-screen photo — pinch to zoom, drag to pan when
            zoomed, double-tap to reset. Lives behind the PIP/pills. */}
          {primaryUri && (
            <GestureDetector gesture={primaryGesture}>
              <Reanimated.View style={[StyleSheet.absoluteFill, primaryAnimStyle]}>
                {primaryShot?.kind === 'video' ? (
                  <PostVideo
                    uri={primaryUri}
                    playing={previewPlaying}
                    muted={previewMuted}
                    style={StyleSheet.absoluteFill}
                    accessibilityLabel={
                      primaryFacing === 'rear' ? 'Your view video' : 'Selfie video'
                    }
                  />
                ) : (
                  <Image
                    source={{ uri: primaryUri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                )}
              </Reanimated.View>
            </GestureDetector>
          )}

          {/* Tagged bubbles — read-only preview, anchored above the pill column.
            Rendered BEFORE the PIP so the draggable PIP paints on top. */}
          <TaggedBubbleStack
            users={taggedUsers}
            style={{ left: OFFSET.o16, bottom: bubbleStackBottom }}
          />

          {/* Pip — draggable, tap to swap. Height tracks the pip photo's aspect
            (pipH) so a landscape shot shows wide-and-short, not cropped into a
            portrait box. The clamp/snap math above uses the same pipH. */}
          {pipUri && (
            <GestureDetector gesture={pipGesture}>
              <Reanimated.View style={[styles.pip, { height: pipH }, pipAnimStyle]}>
                {pipShot?.kind === 'video' ? (
                  <PostVideo
                    uri={pipUri}
                    playing={previewPlaying}
                    muted
                    style={[StyleSheet.absoluteFill, styles.pipVideo]}
                    accessibilityLabel="Small video. Tap to swap, hold to move."
                  />
                ) : (
                  <Image
                    source={{ uri: pipUri }}
                    style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.r12 }]}
                    resizeMode="cover"
                  />
                )}
              </Reanimated.View>
            </GestureDetector>
          )}

          {/* Sound — top left, when the big shot is a video. */}
          {primaryShot?.kind === 'video' && (
            <SoundButton
              muted={previewMuted}
              onToggle={() => setPreviewMuted((m) => !m)}
              style={[styles.previewSound, { top: topRightY(insets.top) }]}
            />
          )}

          {/* Discard — top right */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={discardQuestion.replace('?', '')}
            style={({ pressed }) => [
              styles.discardButton,
              { top: topRightY(insets.top) },
              pressed && { opacity: ALPHA.a80 },
            ]}
            onPress={handleDiscard}
            disabled={isUploading}
          >
            <Text style={styles.discardX}>×</Text>
          </Pressable>

          {/* Post — bottom center */}
          <View style={styles.postButtonFloat}>
            {/* Tag + Caption pills — inline. PIP may paint over this row. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: pillGap,
                width: pillRowW,
              }}
            >
              <Pressable
                disabled={isUploading}
                onPress={() => setActiveSheet('tag')}
                style={({ pressed }) => [
                  { flex: 1, marginRight: pillGap / 2 },
                  pressed && { opacity: ALPHA.a85 },
                ]}
              >
                <GlassPill>
                  <Text
                    style={[
                      styles.captionPillText,
                      taggedUsers.length + slots.length > 0 && { color: COLORS.white },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {tagPillLabel(taggedUsers, slots.length)}
                  </Text>
                </GlassPill>
              </Pressable>

              <Pressable
                disabled={isUploading}
                onPress={() => setActiveSheet('caption')}
                style={({ pressed }) => [
                  { flex: 1, marginLeft: pillGap / 2 },
                  pressed && { opacity: ALPHA.a85 },
                ]}
              >
                <GlassPill>
                  <Text
                    style={[styles.captionPillText, caption.trim() && { color: COLORS.white }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {caption.trim() || '+ Add a caption'}
                  </Text>
                </GlassPill>
              </Pressable>
            </View>

            {/* Per-post location pill — default OFF (explicit opt-in). First tap
              ON triggers the native permission prompt (asked once, cached in
              lib/location.ts); a denial silently leaves it OFF. When ON the pill
              fills with the theme accent so the opt-in state is unmistakable.
              Posting never depends on this succeeding — the upload handler
              degrades to null coords on deny/failure. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: pillGap,
                width: pillRowW,
              }}
            >
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Add location"
                accessibilityState={{ checked: locationEnabled }}
                disabled={isUploading}
                onPress={onToggleLocation}
                style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: ALPHA.a85 }]}
              >
                <GlassPill active={locationEnabled}>
                  <Text
                    style={[styles.captionPillText, locationEnabled && { color: COLORS.offBlack }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {locationEnabled ? 'Location on' : '+ Add location'}
                  </Text>
                </GlassPill>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.postButton,
                (isUploading || tagsMissing > 0) && { opacity: ALPHA.a50 },
                pressed && { opacity: ALPHA.a82 },
              ]}
              disabled={isUploading}
              onPress={() => {
                if (tagsMissing > 0) {
                  haptic('warning');
                  setActiveSheet('tag');
                  return;
                }
                if (frozenFront.current && frozenRear.current) {
                  onPost(frozenFront.current, frozenRear.current);
                }
              }}
            >
              <Text style={styles.postButtonText}>
                {tagsMissing > 0 ? `Tag ${tagsMissing} more` : 'Post'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        <CaptionSheet
          visible={activeSheet === 'caption'}
          initialValue={caption}
          onClose={(committed) => {
            onCaptionChange(committed);
            setActiveSheet('none');
          }}
          onOpenTagAt={(atIndex, currentText) => {
            // User typed `@` mid-caption. Commit the current text (with the
            // `@` still in place) and hand off to TagSheet in single-shot mode.
            onCaptionChange(currentText);
            setCaptionAtIndex(atIndex);
            setActiveSheet('tag');
          }}
        />

        {slotsOn ? (
          <TagSlotsSheet
            visible={activeSheet === 'tag' && captionAtIndex === null}
            maxTags={maxTags}
            initialFriends={taggedUsers}
            onClose={(friends, filledSlots) => {
              onTaggedUsersChange(friends);
              onSlotsChange(filledSlots);
              setActiveSheet('none');
            }}
          />
        ) : null}

        <TagSheet
          visible={activeSheet === 'tag' && (!slotsOn || captionAtIndex !== null)}
          initialSelected={taggedUsers}
          initialInvites={inviteCount}
          singleShot={captionAtIndex !== null}
          onCancel={() => {
            // If we came from the caption `@` bridge, return to the caption
            // sheet (the `@` stays in the text). Otherwise, close entirely.
            if (captionAtIndex !== null) {
              setCaptionAtIndex(null);
              setActiveSheet('caption');
            } else {
              setActiveSheet('none');
            }
          }}
          onCommit={(users, invites) => {
            if (captionAtIndex !== null && users.length > 0) {
              // `@` bridge commit: splice `username ` right after the `@`
              // at captionAtIndex, add the user to the taggedUsers list
              // (deduped + capped), and reopen the caption sheet.
              const picked = users[0];
              const insertion = `${picked.username} `;
              const spliced =
                caption.slice(0, captionAtIndex + 1) +
                insertion +
                caption.slice(captionAtIndex + 1);
              onCaptionChange(spliced);

              const already = taggedUsers.some((u) => u.user_id === picked.user_id);
              if (!already) {
                if (taggedUsers.length + inviteCount + slots.length >= maxTags) {
                  haptic('warning');
                } else {
                  onTaggedUsersChange([...taggedUsers, picked]);
                }
              }

              setCaptionAtIndex(null);
              setActiveSheet('caption');
            } else {
              onTaggedUsersChange(users);
              onInviteCountChange(invites);
              setActiveSheet('none');
            }
          }}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Caption Sheet ────────────────────────────────────────────────────────────

interface CaptionSheetProps {
  visible: boolean;
  initialValue: string;
  onClose: (committed: string) => void;
  /** Fires when the user types `@` — parent closes this sheet and opens TagSheet. */
  onOpenTagAt?: (atIndex: number, currentText: string) => void;
}

function CaptionSheet({ visible, initialValue, onClose, onOpenTagAt }: CaptionSheetProps) {
  const [draft, setDraft] = useState(initialValue);
  const cursorRef = useRef(0);

  // Reseed when the sheet re-opens (ignore initialValue changes while open).
  useEffect(() => {
    if (visible) setDraft(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const commit = () => onClose(draft.trim());

  const handleChangeText = (next: string) => {
    // Detect a freshly typed `@` at the current cursor. If so, hand off to
    // the parent which will commit the current draft and open the TagSheet.
    if (onOpenTagAt && next.length > draft.length) {
      const pos = cursorRef.current;
      if (pos > 0 && next[pos - 1] === '@') {
        onOpenTagAt(pos - 1, next);
        return;
      }
    }
    setDraft(next);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={commit}
    >
      <View style={styles.sheetFlex}>
        <Pressable style={styles.sheetScrim} onPress={commit} />
        <View style={styles.sheetPanel}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetLabelRow}>
            <Text style={styles.sheetLabel}>Caption</Text>
            <Text style={styles.sheetCounter}>{draft.length}/200</Text>
          </View>
          <TextInput
            style={styles.sheetInput}
            value={draft}
            onChangeText={handleChangeText}
            onSelectionChange={(e) => {
              cursorRef.current = e.nativeEvent.selection.end;
            }}
            placeholder="What's the story?"
            placeholderTextColor={themeColors(true).muted}
            multiline
            maxLength={200}
            autoFocus
            keyboardAppearance="dark"
            textAlignVertical="top"
          />
          <Pressable
            style={({ pressed }) => [styles.sheetDone, pressed && { opacity: ALPHA.a85 }]}
            onPress={commit}
          >
            <Text style={styles.sheetDoneText}>Done</Text>
          </Pressable>
          <KeyboardInset />
        </View>
      </View>
    </Modal>
  );
}

// ─── Tag Sheet ────────────────────────────────────────────────────────────────

function TagUserRow({
  item,
  selected,
  onPress,
}: {
  item: TaggableFriend;
  selected: boolean;
  onPress: () => void;
}) {
  const display = item.display_name ?? item.username;
  const initial = display[0].toUpperCase();
  const nudgeDays = useTagStore((s) => s.nudgeDays);
  const { accent } = useAppTheme().colors;
  const nudge = nudgeLabel(item.last_tagged_at, item.has_open_tag, nudgeDays);
  const reason = cantTagReason(item);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tagRow,
        selected && styles.tagRowSelected,
        item.has_open_tag && { opacity: ALPHA.a40 },
        pressed && { opacity: ALPHA.a70 },
      ]}
      disabled={item.has_open_tag}
      onPress={onPress}
    >
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.tagAvatar} />
      ) : (
        <View style={[styles.tagAvatar, styles.tagAvatarFallback]}>
          <Text style={styles.tagAvatarInitial}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.tagRowName}>
          {display} · <PointsBadge points={item.points} style={styles.tagRowHandle} />
        </Text>
        <Text style={styles.tagRowHandle}>
          @{item.username}
          {reason ? ` · ${reason}` : ''}
        </Text>
        {nudge ? <Text style={[styles.tagRowNudge, { color: accent }]}>{nudge}</Text> : null}
      </View>
      {selected ? <Text style={styles.tagRowCheck}>✓</Text> : null}
    </Pressable>
  );
}

interface TagSheetProps {
  visible: boolean;
  initialSelected: TaggedUser[];
  /** Slots already set aside for people who aren't on Mahi. */
  initialInvites: number;
  onCancel: () => void;
  onCommit: (users: TaggedUser[], invites: number) => void;
  /**
   * When true, tapping a user immediately commits just that one user and
   * closes the sheet — used by the caption `@` bridge where picking is a
   * single-shot autocomplete, not multi-select.
   */
  singleShot?: boolean;
}

function TagSheet({
  visible,
  initialSelected,
  initialInvites,
  onCancel,
  onCommit,
  singleShot,
}: TagSheetProps) {
  const [selected, setSelected] = useState<TaggedUser[]>(initialSelected);
  const [invites, setInvites] = useState(initialInvites);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TaggableFriend[]>([]);
  const maxTags = useTagStore((s) => s.maxTags);
  const canInvite = useFeatureFlag('invite-links');
  const inviteStepOn = useFeatureFlag('tags-invite-step');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<TextInput>(null);
  const filled = selected.length + invites;
  // Friends who can be tagged right now (from the unfiltered list); null until it has loaded.
  const [availableFriends, setAvailableFriends] = useState<number | null>(null);
  // Friends first (the server's rule since 2026-10-03): an invite only fills a slot no free
  // friend can, so it waits until every free friend is picked.
  const inviteBlocked = inviteBlockedReason({
    freeFriends: Math.max(0, (availableFriends ?? 0) - selected.length),
    filled,
    maxTags,
  });
  const addInvite = () => {
    if (inviteBlocked) {
      haptic('warning');
      useToastStore.getState().show(inviteBlocked);
      return;
    }
    haptic('selection');
    setInvites((n) => n + 1);
  };
  const step = tagSheetStep({
    flagOn: inviteStepOn,
    canInvite,
    singleShot: !!singleShot,
    availableFriends,
    maxTags,
  });

  // Reseed when the sheet re-opens; ignore changes to initialSelected while open.
  useEffect(() => {
    if (visible) {
      setSelected(initialSelected);
      setInvites(initialInvites);
      setQuery('');
      setResults([]);
      setAvailableFriends(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // With the invite step on, the keyboard waits until we know friends can fill the slots, so it
  // never covers the step. Off: the search field takes focus on open, as before.
  const stepIsFriends = step === 'friends';
  useEffect(() => {
    if (visible && inviteStepOn && stepIsFriends) searchRef.current?.focus();
  }, [visible, inviteStepOn, stepIsFriends]);

  // Friends who follow back, filtered as you type (350ms debounce). An empty
  // query lists them all, so the sheet opens with the people you can tag.
  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    setLoading(true);
    let stale = false;
    debounceRef.current = setTimeout(
      async () => {
        const { data } = await getTaggableFriends(q, 50);
        if (stale) return;
        setResults(data ?? []);
        // The whole list (no search) says how many friends can fill a slot; a failed read counts as none.
        if (!q) setAvailableFriends((data ?? []).filter((f) => !f.has_open_tag).length);
        setLoading(false);
      },
      q ? WAIT.search : 0
    );
    return () => {
      stale = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible]);

  const toggle = (u: TaggableFriend) => {
    const asTagged: TaggedUser = {
      user_id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
    };

    // Single-shot mode: tap to immediately commit just this one user.
    if (singleShot) {
      onCommit([asTagged], invites);
      return;
    }

    const already = selected.some((s) => s.user_id === u.id);
    if (already) {
      setSelected((prev) => prev.filter((s) => s.user_id !== u.id));
      return;
    }
    if (filled >= maxTags) {
      haptic('warning');
      return;
    }
    setSelected((prev) => [...prev, asTagged]);
  };

  return (
    // The system page sheet: swipe down (or ✕) cancels; onRequestClose fires for both.
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={styles.tagSheetPanel}>
        <View style={styles.sheetLabelRow}>
          <Text style={styles.sheetLabel}>Tag people</Text>
          <View style={styles.sheetHeaderEnd}>
            {singleShot ? null : (
              <Text style={styles.sheetCounter}>
                {filled}/{maxTags}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.sheetCloseX, pressed && { opacity: ALPHA.a70 }]}
              onPress={onCancel}
            >
              <Text style={styles.sheetCloseXText}>×</Text>
            </Pressable>
          </View>
        </View>

        {step === 'invite' && availableFriends !== null ? (
          <InviteStep
            maxTags={maxTags}
            availableFriends={availableFriends}
            friends={selected.length}
            invites={invites}
            onAdd={addInvite}
            onRemove={() => setInvites((n) => Math.max(0, n - 1))}
          />
        ) : null}

        <TextInput
          ref={searchRef}
          style={styles.tagSearchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search friends who follow you back"
          placeholderTextColor={themeColors(true).muted}
          autoFocus={!inviteStepOn}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          clearButtonMode="while-editing"
          keyboardAppearance="dark"
        />

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          style={styles.tagResultsList}
          ListEmptyComponent={
            loading ? null : (
              <Text style={styles.tagEmptyText}>
                {query.trim()
                  ? 'No friends found.'
                  : step === 'invite'
                    ? 'Friends who follow you back show up here.'
                    : 'Only friends who follow you back can be tagged.'}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <TagUserRow
              item={item}
              selected={selected.some((s) => s.user_id === item.id)}
              onPress={() => toggle(item)}
            />
          )}
        />

        {singleShot || !canInvite || step !== 'friends' ? null : (
          <View style={styles.inviteRow}>
            <Text style={styles.inviteLabel}>
              {invites > 0
                ? `${invites} to invite — you'll get ${invites > 1 ? 'links' : 'a link'} to share after posting`
                : inviteBlocked && filled < maxTags
                  ? `Not on Mahi yet? ${inviteBlocked}, then invite them.`
                  : 'Not on Mahi yet? Invite them instead.'}
            </Text>
            <View style={styles.inviteSteppers}>
              {invites > 0 ? (
                <Pressable
                  style={({ pressed }) => [styles.inviteStep, pressed && { opacity: ALPHA.a70 }]}
                  onPress={() => setInvites((n) => Math.max(0, n - 1))}
                >
                  <Text style={styles.inviteStepText}>−</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.inviteStep,
                  { opacity: filled >= maxTags ? ALPHA.a30 : 1 },
                  pressed && { opacity: ALPHA.a70 },
                ]}
                disabled={filled >= maxTags}
                onPress={addInvite}
              >
                <Text style={styles.inviteStepText}>+</Text>
              </Pressable>
            </View>
          </View>
        )}

        {singleShot ? null : (
          <Pressable
            style={({ pressed }) => [styles.sheetDone, pressed && { opacity: ALPHA.a85 }]}
            onPress={() => onCommit(selected, invites)}
          >
            <Text style={styles.sheetDoneText}>Done</Text>
          </Pressable>
        )}
        <KeyboardInset />
      </View>
    </Modal>
  );
}

/**
 * Hand over one invite link at a time: each is for one person and works once, so they can't
 * go out in a single message. The share sheet resolves when it closes, so the next one waits
 * its turn. A link the user skips stays on the server but the app has no way back to it.
 */
async function shareInvites(invites: PostInvite[]): Promise<void> {
  for (const invite of invites) {
    try {
      const result = await Share.share({ message: inviteShareMessage(invite.url, invite.code) });
      // Only a link that actually went somewhere counts as shared.
      if (result.action === Share.sharedAction) track('invite_shared', {});
    } catch {
      // A share sheet that won't open shouldn't undo a post that already landed.
      return;
    }
  }
}

// ─── CameraScreen ─────────────────────────────────────────────────────────────

interface CameraScreenProps {
  /** Apple's tab bar: the post preview opened or closed (the bar hides while it is open). */
  onComposingChange?: (open: boolean) => void;
}

export default function CameraScreen({
  onComposingChange,
}: CameraScreenProps = {}): React.JSX.Element {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const { dark } = useAppTheme();
  // The glass bar sits on the left, level with the small window's spot: the window starts past it.
  const railRoom = useRailRoom();
  // Apple's tab bar at the bottom: the shutter row, the lens switch and the small window sit
  // this much higher so they clear it. 0 without the tab bar.
  const lift = cameraLift(useTabBarRoom(), OFFSET.o32, SPACE.s16);
  // The page's height: the screen, or above the tab bar, where the shutter row sits higher.
  const pageHeight = usePageSize().height;

  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [flashChoice, setFlashChoice] = useState<FlashChoice>(() => flashThisSession);
  const cycleFlash = () => {
    const next = nextFlash(flashChoice);
    flashThisSession = next;
    haptic('selection');
    setFlashChoice(next);
  };

  // 0.5× ultra-wide lens (back camera only; pure capture config, not persisted).
  // `availableLenses` is populated from the camera ref (iOS reports physical
  // lenses; Android reports none). `ultraWideLens` is the ultra-wide lens id if
  // this device has one — when null the toggle is hidden and we stay at 1×.
  // `useUltraWide` is the user's current choice; we default to 1× because the
  // ultra-wide lens distorts faces.
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [useUltraWide, setUseUltraWide] = useState(false);
  const ultraWideLens = findUltraWideLens(availableLenses);
  const [isUploading, setIsUploading] = useState(false);
  const uploadingRef = useRef(false);
  const [frontPhoto, setFrontPhoto] = useState<CapturedPhoto | null>(null);
  const [rearPhoto, setRearPhoto] = useState<CapturedPhoto | null>(null);
  const [caption, setCaption] = useState<string>('');
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  // Slots kept for people not on Mahi — the server turns each into a link to share.
  const [inviteCount, setInviteCount] = useState(0);
  // Per-post location opt-in. Default OFF — we NEVER attach coordinates unless
  // the user explicitly turns this on for the current post. Reset after each
  // post / discard so location never silently carries over.
  const [locationEnabled, setLocationEnabled] = useState(false);

  const userId = useAuthStore((s) => s.user?.id);
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const requiredTags = useTagStore((s) => s.requiredTags);
  const { openTags, serverOffsetMs, loaded: tagsLoaded } = useOpenTags();
  const showTagBanner = useFeatureFlag('tag-challenges');
  const pipGuideOn = useFeatureFlag('camera-pip-guide');
  const inviteStepOn = useFeatureFlag('tags-invite-step');
  // Flag `tag-slots`: slots filled on the tag screen before posting. Read fresh from the server
  // whenever a preview opens — never kept on the phone (they expire).
  const tagSlotsOn = useFeatureFlag('tag-slots');
  const [slots, setSlots] = useState<ScreenSlot[]>([]);
  // The last post's invite links and which are sent. In memory only — links expire.
  const [postInvites, setPostInvites] = useState<InviteItem[]>([]);
  // The first photo, shown in the small window on the live camera until the second is taken.
  const [guidePhotoUri, setGuidePhotoUri] = useState<string | null>(null);
  const [guideIsVideo, setGuideIsVideo] = useState(false);

  // Video posts: flag on AND this build has the video module. Off = today's photo-only camera.
  const videoOn = useVideoPosts();
  // The Photo / Video switch by the shutter: what a tap does. Holding always records.
  const [shotMode, setShotMode] = useState<MediaType>('photo');
  // A hold asked for a video while the switch says Photo.
  const [holdVideo, setHoldVideo] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Read (never asked) once video is on; asked only when someone first records.
  const [micStatus, setMicStatus] = useState<'unknown' | 'undetermined' | 'granted' | 'denied'>(
    'unknown'
  );
  const recording = recordingSince !== null;
  const cameraMode = videoOn && (shotMode === 'video' || holdVideo) ? 'video' : 'picture';

  useEffect(() => {
    if (!videoOn) return;
    let live = true;
    Camera.getMicrophonePermissionsAsync()
      .then((p) => {
        if (!live) return;
        setMicStatus(
          p.granted ? 'granted' : p.status === 'undetermined' ? 'undetermined' : 'denied'
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [videoOn]);

  // The recording countdown ticks while recording.
  useEffect(() => {
    if (recordingSince === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [recordingSince]);

  // Null until the profile has loaded: the counter shows a dash, never a 0 that then changes.
  const pointsCountNow = profile ? profile.streak_current : null;

  // Reactive posting: your first post, then only while a friend's tag is open. The feed already
  // knows whether you've posted: its `unlockedUntil` is null until your first post (and the feed
  // is re-read after every post). Nothing here is kept on the device.
  const feedLoaded = useFeedStore((s) => s.loaded);
  const unlockedUntil = useFeedStore((s) => s.unlockedUntil);
  const gate = reactivePostingGate({
    hasPosted: feedLoaded ? unlockedUntil !== null : null,
    tagsLoaded,
    openTags,
    serverOffsetMs,
  });
  const blocked = gate !== 'open';

  // Tap to focus (flag `camera-tap-focus`): switch on, an iPhone, and a build whose camera can
  // focus on a point (build 11+). OTA updates also reach build 10, which can't: there it's off.
  const tapFocusOn = useFeatureFlag('camera-tap-focus');
  const [nativeFocus, setNativeFocus] = useState(false);
  const focusOn = tapFocusAvailable({ flagOn: tapFocusOn, platform: Platform.OS, nativeFocus });
  const [cameraSize, setCameraSize] = useState({ width: 0, height: 0 });
  // The last tap's square, on the camera it was tapped on (a flip leaves it behind).
  const [focusTap, setFocusTap] = useState<(FocusTap & { facing: 'back' | 'front' }) | null>(null);

  const doubleTapToFlip = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => {
      if (captureState !== 'idle') return;
      haptic('flip');
      setFacing((f) => (f === 'back' ? 'front' : 'back'));
    });
  // With tap to focus on, a single tap waits out the double-tap window: keep it short.
  if (focusOn) doubleTapToFlip.maxDelay(CAMERA.doubleTapMs);

  const focusAt = (x: number, y: number) => {
    const cam = cameraRef.current;
    const point = focusPoint(x, y, cameraSize.width, cameraSize.height);
    if (!point || !cam?.isFocusAtAvailable?.()) return;
    cam.focusAtAsync(point.x, point.y).catch((err) => {
      console.log('[CameraScreen] focus failed', err);
    });
    const origin = focusSquareOrigin(x, y, FOCUS_SQUARE_SIZE, cameraSize.width, cameraSize.height);
    setFocusTap({ ...origin, id: Date.now(), facing });
  };

  // One tap on the live camera focuses there; two still flip it (the single tap waits for that).
  const tapToFocus = Gesture.Tap()
    .enabled(focusOn && !blocked)
    .runOnJS(true)
    .requireExternalGestureToFail(doubleTapToFlip)
    .onEnd((e, success) => {
      if (!success) return;
      if (captureState !== 'idle' && captureState !== 'awaiting-second') return;
      focusAt(e.x, e.y);
    });

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission();
    }
  }, [cameraPermission?.status]);

  // Query the physical lenses for the active camera. On iOS this resolves to the
  // device's lens ids (incl. ultra-wide on capable devices); on Android it
  // resolves to [] (no per-lens selection) so the 0.5× control stays hidden.
  // Fired from CameraView.onCameraReady and onAvailableLensesChanged so it stays
  // correct across front/back flips. Guarded with a try/catch + mounted ref so a
  // platform without the API never crashes the camera.
  const refreshAvailableLenses = async () => {
    try {
      const lenses = (await cameraRef.current?.getAvailableLensesAsync?.()) ?? [];
      setAvailableLenses(lenses);
      console.log('[CameraScreen] available lenses', lenses);
    } catch (err) {
      console.log('[CameraScreen] getAvailableLensesAsync failed', err);
      setAvailableLenses([]);
    }
  };

  // If the ultra-wide lens isn't available for the current camera (e.g. after a
  // flip to the selfie cam, or on a device without one), force back to 1× so we
  // never pass an unsupported lens id to CameraView.
  useEffect(() => {
    if (!ultraWideLens && useUltraWide) {
      setUseUltraWide(false);
    }
  }, [ultraWideLens, useUltraWide]);

  // Android landscape capture. iOS uses responsiveOrientationWhenOrientationLocked
  // on <CameraView>, but that prop is a no-op on Android. So on Android we track
  // physical device tilt via the accelerometer and bake the matching rotation into
  // the shot in takePhoto — the UI stays portrait-locked. Portrait (the common
  // case) records no tilt and applies no rotation, so it is unaffected.
  const deviceTiltRef = useRef<'portrait' | 'landscape-left' | 'landscape-right'>('portrait');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    Accelerometer.setUpdateInterval(CAMERA.tiltUpdateMs);
    const sub = Accelerometer.addListener(({ x, y }) => {
      // |x| dominating gravity ⇒ held sideways. The +0.35 hysteresis avoids
      // flapping near the diagonal; the sign of x picks the landscape direction.
      if (Math.abs(x) > Math.abs(y) + CAMERA.tiltLead) {
        deviceTiltRef.current = x > 0 ? 'landscape-right' : 'landscape-left';
      } else {
        deviceTiltRef.current = 'portrait';
      }
    });
    return () => sub.remove();
  }, []);

  // Helper: take a photo from whatever camera is currently active
  const takePhoto = async (): Promise<CapturedPhoto | null> => {
    if (!cameraRef.current) return null;
    const photo = await cameraRef.current.takePictureAsync({ quality: PHOTO_CAPTURE.shotQuality });
    if (!photo?.uri) return null;
    // Re-encode to bake EXIF orientation into pixel data. With
    // `responsiveOrientationWhenOrientationLocked` on (iOS), a sideways-held
    // device produces a landscape-EXIF shot even though the app stays
    // portrait-locked; this manipulate step flattens that EXIF into the actual
    // pixels, so the result's width/height already reflect the true orientation.
    // On Android the responsive-orientation prop is a no-op, so rotate the shot
    // to match the physical tilt detected by the accelerometer; iOS bakes the
    // EXIF itself and always uses [] (no rotation). NOTE: the 90/-90 mapping
    // assumes manipulateAsync rotates clockwise for positive degrees — verify on
    // a physical Android device and flip the signs if a landscape shot comes out
    // upside-down. Portrait applies no rotation (unchanged behavior).
    const tiltActions =
      Platform.OS === 'android' && deviceTiltRef.current !== 'portrait'
        ? [{ rotate: deviceTiltRef.current === 'landscape-left' ? 90 : -90 }]
        : [];
    const {
      uri: normalizedUri,
      width,
      height,
    } = await manipulateAsync(photo.uri, tiltActions, {
      // The one JPEG encode that is uploaded (see PHOTO_CAPTURE).
      compress: PHOTO_CAPTURE.jpegQuality,
      format: SaveFormat.JPEG,
    });
    const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // Derive aspect from the flattened pixels; fall back to the raw capture
    // dims, then a portrait default, so a missing value never yields NaN/0.
    const w = width || photo.width || 3;
    const h = height || photo.height || 4;
    const aspectRatio = h > 0 ? w / h : 0.75;
    console.log('[CameraScreen] captured', { w, h, aspectRatio });
    return { kind: 'photo', uri: normalizedUri, base64, aspectRatio };
  };

  // ── Video (flag `video-posts`, and only on builds with the video module) ──────────────────
  // The camera stays in photo mode unless the switch says Video or a held shutter asks for a
  // video; it is muted until the microphone is granted, so turning to video never prompts.
  const stopRequestedRef = useRef(false);
  const recordingRef = useRef(false);
  /** The shutter is being held for a video: letting go stops it (even before it starts). */
  const heldForVideoRef = useRef(false);

  const recordVideo = async (): Promise<CapturedPhoto | null> => {
    const cam = cameraRef.current;
    if (!cam) return null;
    recordingRef.current = true;
    const startedAt = Date.now();
    setRecordingSince(startedAt);
    setNow(startedAt);
    try {
      // A hold from the Photo switch turns the camera to video first. Until that lands the camera
      // refuses at once ("not ready"), so try again for a moment, while the shutter is held.
      for (;;) {
        if (stopRequestedRef.current) return null;
        const attemptAt = Date.now();
        try {
          const result = await cam.recordAsync({
            maxDuration: VIDEO_RECORDING.maxDuration,
            maxFileSize: VIDEO_RECORDING.maxFileSize,
            codec: VIDEO_RECORDING.codec,
          });
          if (!result?.uri) return null;
          // Phones record upright 9:16 unless turned sideways; the preview only needs a guide.
          return { kind: 'video', uri: result.uri, base64: '', aspectRatio: VIDEO_ASPECT };
        } catch (err) {
          const quick = Date.now() - attemptAt < 300;
          if (!quick || Date.now() - startedAt > 1500) throw err;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    } catch (err) {
      console.log('[CameraScreen] recording failed', err);
      useToastStore.getState().show("Couldn't record — hold the shutter a little longer");
      return null;
    } finally {
      recordingRef.current = false;
      setRecordingSince(null);
      setHoldVideo(false);
    }
  };

  const stopVideo = () => {
    stopRequestedRef.current = true;
    cameraRef.current?.stopRecording();
    // A stop that lands just before the recording really began is lost: ask once more.
    setTimeout(() => {
      if (recordingRef.current) cameraRef.current?.stopRecording();
    }, 400);
  };

  /** The first recording asks for the microphone — never before, and never with video off. */
  const askMicIfNew = async (): Promise<boolean> => {
    if (micStatus !== 'undetermined') return false;
    try {
      const p = await Camera.requestMicrophonePermissionsAsync();
      setMicStatus(p.granted ? 'granted' : 'denied');
    } catch {
      setMicStatus('denied');
    }
    return true;
  };

  const shoot = (kind: MediaType) => (kind === 'video' ? recordVideo() : takePhoto());

  // Two-stage capture: tap 1 takes whichever camera is currently showing,
  // then flips to the other side for tap 2. The user picks their starting
  // side with the flip button before capturing.
  const firstPhotoRef = useRef<CapturedPhoto | null>(null);
  const firstFacingRef = useRef<'back' | 'front'>('back');

  const captureFirst = async (kind: MediaType = 'photo') => {
    if (captureState !== 'idle') return;

    // Step 1: capture the current camera side
    setCaptureState('capturing-first');
    firstFacingRef.current = facing;
    if (kind === 'photo') await new Promise((r) => setTimeout(r, 300));
    const photo = await shoot(kind);
    if (!photo) {
      setCaptureState('idle');
      return;
    }
    firstPhotoRef.current = photo;
    setGuidePhotoUri(photo.uri);
    setGuideIsVideo(photo.kind === 'video');

    // Step 2: flip to the other side and wait for the user to tap again
    setCaptureState('switching');
    setFacing(facing === 'back' ? 'front' : 'back');
    await new Promise((r) => setTimeout(r, 800));
    setCaptureState('awaiting-second');
  };

  const captureSecond = async (kind: MediaType = 'photo') => {
    if (captureState !== 'awaiting-second') return;
    const firstPhoto = firstPhotoRef.current;
    if (!firstPhoto) {
      setCaptureState('idle');
      return;
    }

    setCaptureState('capturing-second');
    const secondPhoto = await shoot(kind);
    // A video that didn't record (let go too soon) keeps the first shot: try the second again.
    if (!secondPhoto && kind === 'video') {
      setCaptureState('awaiting-second');
      return;
    }
    setCaptureState('idle');
    firstPhotoRef.current = null;
    setGuidePhotoUri(null);
    if (!secondPhoto) return;

    // Assign to front/rear based on which camera took which shot
    if (firstFacingRef.current === 'back') {
      setRearPhoto(firstPhoto);
      setFrontPhoto(secondPhoto);
    } else {
      setFrontPhoto(firstPhoto);
      setRearPhoto(secondPhoto);
    }
  };

  const handleShutterPress = () => {
    if (captureState === 'idle') {
      haptic('shutter');
      captureFirst();
    } else if (captureState === 'awaiting-second') {
      haptic('shutter');
      captureSecond();
    }
  };

  // With video on: a tap does what the switch says (photo, or start / stop a video); a hold
  // records until let go, or 15 s. Flag off never gets here (today's handleShutterPress runs).
  const handleShutter = async (press: ShutterPress) => {
    const intent = shutterIntent({
      videoOn,
      mode: shotMode,
      recording: recordingRef.current,
      press,
    });
    if (intent === 'none') return;
    if (intent === 'stop-video') {
      heldForVideoRef.current = false;
      stopVideo();
      return;
    }
    if (captureState !== 'idle' && captureState !== 'awaiting-second') return;
    if (intent === 'photo') {
      handleShutterPress();
      return;
    }
    stopRequestedRef.current = false;
    heldForVideoRef.current = press === 'hold';
    if (await askMicIfNew()) {
      // The microphone question took the finger off the shutter.
      if (press === 'hold') {
        heldForVideoRef.current = false;
        useToastStore.getState().show('Hold the shutter again to record');
        return;
      }
    }
    // Let go while the microphone question or the switch to video was still going.
    if (stopRequestedRef.current) return;
    if (shotMode === 'photo') setHoldVideo(true);
    haptic('shutter');
    if (captureState === 'idle') captureFirst('video');
    else captureSecond('video');
  };

  // Letting go of a held shutter stops its video, even one still starting.
  const handleShutterRelease = () => {
    if (!heldForVideoRef.current) return;
    heldForVideoRef.current = false;
    const intent = shutterIntent({ videoOn, mode: shotMode, recording: true, press: 'release' });
    if (intent === 'stop-video') stopVideo();
  };

  // Toggle the per-post location opt-in. Turning OFF is instant. Turning ON the
  // FIRST time triggers the native permission prompt via lib/location.ts (asked
  // once, decision cached in AsyncStorage — re-enabling later never re-prompts).
  // A denial leaves the toggle OFF so the UI reflects the real grant state and
  // we never imply we'll attach coords we can't get. Never throws.
  const handleToggleLocation = async () => {
    if (locationEnabled) {
      setLocationEnabled(false);
      return;
    }
    haptic('selection');
    // requestLocationPermission caches the decision; first call prompts, later
    // calls return the cached grant/deny without re-prompting.
    const granted = await requestLocationPermission();
    console.log('[CameraScreen] location toggle requested permission', { granted });
    setLocationEnabled(granted);
  };

  // Upload both photos, create post
  const uploadPhotos = async (front: CapturedPhoto, rear: CapturedPhoto) => {
    if (!userId || !profile) return;
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setIsUploading(true);
    haptic('postSent');

    const tempId = `pending_${Date.now()}`;
    // Reactive posting: only a post that answers a tag earns a Mahi point.
    const optimisticPoints =
      profile.streak_current + (answersATag(openTags, serverOffsetMs) ? 1 : 0);
    const captionValue = caption || null;
    const taggedUsersSnapshot = taggedUsers;
    const inviteCountSnapshot = inviteCount;
    const slotsSnapshot = tagSlotsOn ? slots : [];
    // Snapshot the location opt-in for THIS post before we reset UI state below.
    const locationEnabledSnapshot = locationEnabled;

    setProfile({ ...profile, streak_current: optimisticPoints });

    // Optimistic feed entry — use rear as primary display image
    useFeedStore.getState().addPending({
      id: tempId,
      isPending: true,
      user_id: userId,
      image_url: rear.uri,
      pov_image_url: front.uri,
      caption: captionValue,
      streak_day: optimisticPoints,
      // Optimistic entry carries no coords — the per-post location fix is taken
      // lazily right before createPost (below), and confirmPending later swaps in
      // postData with the real (rounded) coordinates if location was opted in.
      latitude: null,
      longitude: null,
      created_at: new Date().toISOString(),
      // Placeholder until the server's row (dated in the user's time zone) replaces it.
      post_date: new Date().toLocaleDateString('en-CA'),
      client_id: null,
      image_path: null,
      pov_image_path: null,
      rear_media_type: rear.kind,
      front_media_type: front.kind,
      locked: false,
      like_count: 0,
      comment_count: 0,
      liked_by_me: false,
      tagged_users: taggedUsersSnapshot,
      profiles: {
        id: userId,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
    });

    // Dismiss preview immediately so camera returns while upload runs
    setFrontPhoto(null);
    setRearPhoto(null);
    setCaption('');
    setTaggedUsers([]);
    setInviteCount(0);
    setSlots([]);
    setLocationEnabled(false);
    setIsUploading(false);

    const clientId = randomUUID();
    let uploadedPaths: string[] = [];

    try {
      // A photo's bytes are already in memory; a video is read from its file only now.
      const bodyOf = async (shot: CapturedPhoto) =>
        decode(
          shot.kind === 'video'
            ? await FileSystem.readAsStringAsync(shot.uri, {
                encoding: FileSystem.EncodingType.Base64,
              })
            : shot.base64
        );
      const { data: paths, error: uploadErr } = await uploadPostMedia({
        userId,
        clientId,
        rear: { shot: { kind: rear.kind, uri: rear.uri }, body: await bodyOf(rear) },
        front: { shot: { kind: front.kind, uri: front.uri }, body: await bodyOf(front) },
      });
      if (uploadErr || !paths) throw uploadErr ?? new Error('upload failed');
      uploadedPaths = [paths.rearPath, paths.frontPath];

      // Per-post location: ONLY when the user opted in for this post. getCurrentLocation
      // returns null on denial, a too-coarse fix, or any error — and it already
      // rounds to ~city-block precision. A null here means we post with no coords;
      // location must NEVER block or crash the post.
      let coords: { latitude: number; longitude: number } | null = null;
      if (locationEnabledSnapshot) {
        coords = await getCurrentLocation();
        console.log('[CameraScreen] location for post', coords ? 'attached' : 'unavailable');
      }

      // One server call: post, points, tags, deadlines and pushes, all or nothing.
      const { data: result, error: postErr } = await createPost({
        clientId,
        imagePath: paths.rearPath,
        povImagePath: paths.frontPath,
        caption: captionValue,
        taggedUserIds: taggedUsersSnapshot.map((u) => u.user_id),
        inviteCount: inviteCountSnapshot,
        slotIds: slotsSnapshot.map((s) => s.challenge_id),
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        rearMediaType: rear.kind,
        frontMediaType: front.kind,
      });
      if (postErr || !result) throw postErr ?? new Error('post failed');

      // The post as the feed shows it; the profile grid (and its post viewer) shows the same.
      const posted = {
        ...result.post,
        like_count: 0,
        comment_count: 0,
        liked_by_me: false,
        profiles: {
          id: userId,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        },
        tagged_users: taggedUsersSnapshot,
        // The photos on screen are the local captures; the next feed read signs the server copies.
        image_url: rear.uri,
        pov_image_url: front.uri,
        rear_media_type: rear.kind,
        front_media_type: front.kind,
        locked: false,
      } satisfies FeedPost;
      useFeedStore.getState().confirmPending(tempId, posted);
      // Tags reached friends, then (when the server says so) a Mahi point was earned.
      hapticSequence(
        postedMoments({
          tags: taggedUsersSnapshot.length + inviteCountSnapshot + slotsSnapshot.length,
          pointsBefore: profile.streak_current,
          pointsAfter: result.streak.streak_current,
        })
      );
      // Posting unlocks the feed: read it again so friends' posts appear.
      useFeedStore.getState().sync(true);
      useProfilePostsStore.getState().addPost(posted);

      const current = useUserStore.getState().profile;
      if (current) {
        setProfile({
          ...current,
          streak_current: result.streak.streak_current,
          streak_highest: result.streak.streak_highest,
        });
      }

      track('tag_sent', {
        post_id: result.post.id,
        tag_count: taggedUsersSnapshot.length,
        invite_count: inviteCountSnapshot + slotsSnapshot.length,
      });
      for (const answered of result.answered) {
        track('tag_answered', { tagger_id: answered.tagger_id, seconds: answered.seconds });
      }

      if (result.answered.length > 0) useUserStore.getState().refresh(userId);
      // Every post says it worked: the first post opens the feed; an answer earns the point.
      useToastStore.getState().show(
        postedToast({
          answered: result.answered.map((a) => a.username),
          points: result.streak.streak_current,
          // The best before this post (`profile` was read before posting).
          bestBefore: profile.streak_highest,
        }),
        WAIT.toastLong
      );
      useTagStore.getState().syncOpenTags();
      if (tagSlotsOn) {
        // Links were shared on the tag screen; nothing is left to send.
      } else if (inviteStepOn) {
        // A list to send them from, one share sheet each, so none is silently lost.
        setPostInvites(inviteList(result.invites));
      } else {
        await shareInvites(result.invites);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[uploadPhotos] upload failed', err);
      haptic('error');
      useFeedStore.getState().removePending(tempId);
      const current = useUserStore.getState().profile;
      if (current) setProfile({ ...current, streak_current: profile.streak_current });
      removePostPhotos(uploadedPaths).catch(() => {});

      // Say what to change, and give the photos back so the post can go again — except when
      // there's no tag to answer (reactive posting), which the preview can't fix.
      const refusal = postRefusal(message);
      useToastStore.getState().show(refusal.text, WAIT.toastLong);
      if (refusal.keepPhotos) {
        setFrontPhoto(front);
        setRearPhoto(rear);
        setCaption(captionValue ?? '');
        setTaggedUsers(taggedUsersSnapshot);
        setInviteCount(inviteCountSnapshot);
        setLocationEnabled(locationEnabledSnapshot);
        useTagStore.getState().loadRequirement();
      } else {
        useTagStore.getState().syncOpenTags();
      }
      if (refusal.report) {
        Sentry.captureException(err, {
          tags: { flow: 'camera', action: 'upload' },
          extra: { userId },
        });
      }
    } finally {
      uploadingRef.current = false;
    }
  };

  const hasPreview = frontPhoto !== null && rearPhoto !== null;
  useEffect(() => {
    if (hasPreview) useTagStore.getState().loadRequirement();
  }, [hasPreview]);
  // Slots made earlier (still open on the server) fill this post's slots too.
  useEffect(() => {
    if (!hasPreview || !tagSlotsOn) return;
    let stale = false;
    getTagSlots().then(({ data }) => {
      if (!stale && data) setSlots(data);
    });
    return () => {
      stale = true;
    };
  }, [hasPreview, tagSlotsOn]);
  const onComposingRef = useRef(onComposingChange);
  onComposingRef.current = onComposingChange;
  useEffect(() => {
    onComposingRef.current?.(hasPreview);
  }, [hasPreview]);

  // One share sheet for one invite link; only a link that actually went somewhere counts as sent.
  const sendInvite = async (token: string) => {
    const invite = postInvites.find((i) => i.token === token);
    if (!invite) return;
    try {
      const result = await Share.share({ message: inviteShareMessage(invite.url, invite.code) });
      const shared = result.action === Share.sharedAction;
      if (shared) track('invite_shared', {});
      setPostInvites((list) => markInvite(list, token, shared));
    } catch {
      useToastStore.getState().show("Couldn't open sharing — please try again");
    }
  };

  const handleDiscard = () => {
    setFrontPhoto(null);
    setRearPhoto(null);
    setCaption('');
    setTaggedUsers([]);
    setInviteCount(0);
    setSlots([]);
    setLocationEnabled(false);
  };

  // Capture state label shown while sequencing. After the switch, `facing` is the second side.
  // While recording it counts down the 15 seconds instead.
  const captureLabel = recording
    ? recordingLabel(secondsLeft(recordingSince, now))
    : captureLabelFor(captureState, facing);

  // Read each new step out to VoiceOver (iOS has no live regions; Android also gets one below).
  // A recording is announced once, not every second.
  const spokenLabel = recording ? 'Recording' : captureLabel;
  useEffect(() => {
    if (spokenLabel) AccessibilityInfo.announceForAccessibility(spokenLabel);
  }, [spokenLabel]);

  // With video posts off the camera never asks for the microphone; with them on, only when
  // someone first records (askMicIfNew).
  if (!cameraPermission) {
    return <View style={styles.root} />;
  }

  const cameraGranted = cameraPermission.granted;
  const shutterRing = COLORS.accent;
  const shutterFill = COLORS.accent;
  const flipColor = COLORS.white;

  const isCapturing = captureState !== 'idle';
  // The shutter is tappable in 'idle' (start) and 'awaiting-second' (take second shot), and
  // while recording (to stop). Everything else is mid-capture and should be locked out.
  const shutterDisabled =
    blocked || (!recording && captureState !== 'idle' && captureState !== 'awaiting-second');
  const switchDisabled =
    recording || (captureState !== 'idle' && captureState !== 'awaiting-second');

  if (!cameraGranted) {
    return (
      <View style={styles.root}>
        <View style={styles.permissionCenter}>
          <Text style={styles.deniedMessage}>
            Mahi needs camera access to power your fitness experience.
          </Text>
          {!cameraPermission.canAskAgain && (
            <Pressable
              style={({ pressed }) => [styles.permissionButton, pressed && { opacity: ALPHA.a80 }]}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.permissionButtonText}>Open settings</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // The small window in the preview's photo-in-photo spot: what comes second, then the first photo.
  const guide = pipGuide({
    guideOn: pipGuideOn,
    state: captureState,
    facing,
    hasFirstPhoto: guidePhotoUri !== null,
    blocked,
    cameraGranted,
  });

  return (
    <GestureDetector gesture={doubleTapToFlip}>
      <View style={styles.root}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          // Flash: off / on / auto as set; on the selfie side "on" lights the screen instead.
          flash={flashMode(flashChoice, facing)}
          // 0.5× ultra-wide is a back-camera-only physical lens (iOS). Only pass
          // a selectedLens when the user opted in AND we're on the back camera —
          // never feed a back-cam lens id to the selfie cam. undefined ⇒ default
          // wide-angle (1×). No-op on Android (selectedLens is iOS-only).
          selectedLens={
            facing === 'back' && useUltraWide && ultraWideLens ? ultraWideLens : undefined
          }
          onCameraReady={() => {
            refreshAvailableLenses();
            // Build 11+ has native tap to focus; build 10 (reached by OTA) doesn't.
            setNativeFocus(cameraRef.current?.isFocusAtAvailable?.() ?? false);
          }}
          onAvailableLensesChanged={(e) => setAvailableLenses(e.lenses)}
          // Landscape capture WITHOUT a global orientation unlock. The app stays
          // portrait-locked (app.config.js orientation:'portrait' — every other
          // screen + the hand-rolled navigators hardcode portrait dimensions, so
          // a global unlock would break them). This iOS-only flag lets ONLY the
          // camera sense physical tilt and bake the matching EXIF orientation into
          // the shot: hold the phone sideways and you get a true landscape photo,
          // while the camera chrome stays upright. No-op on Android (falls back to
          // a portrait-aspect shot), no native dep, no prebuild required.
          responsiveOrientationWhenOrientationLocked
          onResponsiveOrientationChanged={(e) =>
            console.log('[CameraScreen] responsive orientation', e.orientation)
          }
          // Video posts: video mode only while the switch says Video or a hold is recording.
          // Muted until the microphone is granted, so turning to video never asks for it.
          // With video off none of these are passed: the camera is exactly today's.
          mode={videoOn ? cameraMode : undefined}
          mute={videoOn ? micStatus !== 'granted' : undefined}
          videoQuality={videoOn ? VIDEO_RECORDING.quality : undefined}
          videoBitrate={videoOn ? VIDEO_RECORDING.bitrate : undefined}
          videoStabilizationMode={videoOn ? VIDEO_RECORDING.stabilization : undefined}
        />

        {/* Tap to focus: the live camera's empty area, under every control. */}
        {focusOn && (
          <GestureDetector gesture={tapToFocus}>
            <View
              style={StyleSheet.absoluteFill}
              onLayout={(e) =>
                setCameraSize({
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                })
              }
            >
              <FocusSquare tap={focusTap?.facing === facing ? focusTap : null} />
            </View>
          </GestureDetector>
        )}

        <PointsCounter count={pointsCountNow} />

        {showTagBanner && !blocked && (
          <OpenTagsBanner
            openTags={openTags}
            serverOffsetMs={serverOffsetMs}
            // Never posted (the feed has no open window yet): "First post · no tag needed".
            firstPost={feedLoaded && unlockedUntil === null && tagsLoaded}
          />
        )}

        {guide && (
          <CapturePipGuide
            guide={guide}
            photoUri={guidePhotoUri}
            photoIsVideo={guideIsVideo}
            frame={{
              left: Math.max(PIP_MARGIN, railRoom),
              top: previewPipRestTop(pageHeight, PIP_H) - lift,
              width: PIP_W,
              height: PIP_H,
            }}
          />
        )}

        {/* Capture progress overlay */}
        {captureLabel && (
          <View style={styles.captureLabelWrap} accessibilityLiveRegion="polite">
            <Text style={styles.captureLabel}>{captureLabel}</Text>
          </View>
        )}

        {/* Reactive posting: nothing to answer, so no shutter. */}
        {gate === 'closed' && (
          <BlurView intensity={BLUR_INTENSITY.i60} tint="dark" style={styles.postedOverlay}>
            <View
              style={styles.noTagsCard}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${NO_TAGS_TITLE}. When a friend tags you, you'll have 48 hours to post.`}
            >
              <View style={styles.noTagsIcon}>
                <CameraIcon size={ICON_SIZE.i24} color={COLORS.accent} />
              </View>
              <Text style={styles.postedTitle}>{NO_TAGS_TITLE}</Text>
              <Text style={styles.postedSub}>
                When a friend tags you, you'll have 48 hours to post.
              </Text>
            </View>
          </BlurView>
        )}

        {/* 0.5× / 1× lens toggle — back camera only. Hidden entirely when the
          device has no ultra-wide lens (Android, or older iPhones), so it never
          offers an option we can't honour. Locked out mid-capture and after
          posting is blocked, matching the shutter gating. Sits just above the
          shutter row so it reads as a capture-config affordance. With video
          posts on, the Photo / Video switch sits beside it in the same row. */}
        {((facing === 'back' && ultraWideLens) || videoOn) && !blocked && (
          <View
            style={[styles.lensToggleWrap, lift > 0 && { bottom: LENS_TOGGLE_BOTTOM + lift }]}
            pointerEvents="box-none"
          >
            <View style={styles.toggleRow}>
              {facing === 'back' && ultraWideLens && (
                <View style={styles.lensToggle}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.lensOption,
                      !useUltraWide && styles.lensOptionActive,
                      pressed && { opacity: ALPHA.a80 },
                    ]}
                    disabled={isCapturing}
                    onPress={() => {
                      if (!useUltraWide) return;
                      haptic('selection');
                      setUseUltraWide(false);
                    }}
                  >
                    <Text
                      style={[styles.lensOptionText, !useUltraWide && styles.lensOptionTextActive]}
                    >
                      1×
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.lensOption,
                      useUltraWide && styles.lensOptionActive,
                      pressed && { opacity: ALPHA.a80 },
                    ]}
                    disabled={isCapturing}
                    onPress={() => {
                      if (useUltraWide) return;
                      haptic('selection');
                      setUseUltraWide(true);
                    }}
                  >
                    <Text
                      style={[styles.lensOptionText, useUltraWide && styles.lensOptionTextActive]}
                    >
                      0.5×
                    </Text>
                  </Pressable>
                </View>
              )}
              {videoOn && (
                <View style={styles.lensToggle} accessibilityRole="radiogroup">
                  {(['photo', 'video'] as const).map((m) => (
                    <Pressable
                      key={m}
                      style={({ pressed }) => [
                        styles.lensOption,
                        shotMode === m && styles.lensOptionActive,
                        pressed && { opacity: ALPHA.a80 },
                      ]}
                      disabled={switchDisabled}
                      accessibilityRole="radio"
                      accessibilityLabel={m === 'photo' ? 'Photo' : 'Video'}
                      accessibilityHint={
                        m === 'photo'
                          ? 'Tap the shutter for a photo. Hold it to record a video.'
                          : 'Tap the shutter to start and stop a video of up to 15 seconds.'
                      }
                      accessibilityState={{ checked: shotMode === m, disabled: switchDisabled }}
                      onPress={() => {
                        if (shotMode === m) return;
                        haptic('selection');
                        setShotMode(m);
                      }}
                    >
                      <Text
                        style={[
                          styles.lensOptionText,
                          shotMode === m && styles.lensOptionTextActive,
                        ]}
                      >
                        {m === 'photo' ? 'Photo' : 'Video'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        <View style={[styles.controlsRow, lift > 0 && { bottom: OFFSET.o32 + lift }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch camera"
            style={({ pressed }) => [
              styles.flipButton,
              { opacity: captureState !== 'idle' ? ALPHA.a30 : 1 },
              pressed && { opacity: ALPHA.a70 },
            ]}
            disabled={captureState !== 'idle'}
            onPress={() => {
              haptic('flip');
              setFacing((f) => (f === 'back' ? 'front' : 'back'));
            }}
          >
            <FlipIcon color={flipColor} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shutterLabel({
              videoOn,
              mode: shotMode,
              recording,
              second: captureState === 'awaiting-second',
            })}
            style={({ pressed }) => [
              styles.shutterOuter,
              {
                borderColor: recording ? COLORS.danger : shutterRing,
                shadowColor: dark ? COLORS.black : COLORS.offBlack,
                opacity: shutterDisabled ? ALPHA.a30 : 1,
              },
              pressed && { opacity: ALPHA.a82 },
            ]}
            disabled={shutterDisabled}
            // Video off: exactly today's shutter (a tap, no hold).
            onPress={videoOn ? () => handleShutter('tap') : handleShutterPress}
            onLongPress={videoOn ? () => handleShutter('hold') : undefined}
            delayLongPress={videoOn ? HOLD_TO_RECORD_MS : undefined}
            onPressOut={videoOn ? handleShutterRelease : undefined}
          >
            {gate === 'loading' ? (
              <ActivityIndicator color={shutterRing} />
            ) : recording ? (
              <View style={styles.shutterRecording} />
            ) : (
              <View
                style={[
                  styles.shutterInner,
                  {
                    backgroundColor: videoOn && shotMode === 'video' ? COLORS.danger : shutterFill,
                  },
                ]}
              />
            )}
          </Pressable>

          {/* Flash — photos only, so it steps aside while the switch says Video. */}
          {videoOn && shotMode === 'video' ? (
            <View style={styles.flipButton} />
          ) : (
            <FlashButton choice={flashChoice} onPress={cycleFlash} disabled={switchDisabled} />
          )}
        </View>

        <DualPhotoPreview
          frontPhoto={frontPhoto}
          rearPhoto={rearPhoto}
          onDiscard={handleDiscard}
          onPost={uploadPhotos}
          isUploading={isUploading}
          caption={caption}
          onCaptionChange={setCaption}
          taggedUsers={taggedUsers}
          onTaggedUsersChange={setTaggedUsers}
          inviteCount={inviteCount}
          onInviteCountChange={setInviteCount}
          slotsOn={tagSlotsOn}
          slots={slots}
          onSlotsChange={setSlots}
          requiredTags={requiredTags}
          locationEnabled={locationEnabled}
          onToggleLocation={handleToggleLocation}
        />

        <InviteShareSheet
          invites={postInvites}
          onSend={sendInvite}
          onClose={() => setPostInvites([])}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.ink,
  },
  pointsCounter: {
    position: 'absolute',
    right: OFFSET.o24,
    alignItems: 'center',
  },
  pointsNumber: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f38,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l38,
  },
  pointsLabel: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    opacity: ALPHA.a75,
    marginTop: SPACE.s3,
    lineHeight: LINE_HEIGHT.l14,
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
    color: COLORS.white,
    fontSize: FONT_SIZE.f18,
    lineHeight: LINE_HEIGHT.l24,
    fontFamily: FONTS.semiBold,
    opacity: ALPHA.a90,
  },
  postedOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s32,
  },
  // Reactive posting closed: one card in the middle, in the app's card style (the locked feed's
  // card, and the camera's open-tags pill: frosted, an accent outline, the accent for the icon).
  noTagsCard: {
    alignItems: 'center',
    gap: SPACE.s12,
    paddingVertical: SPACE.s24,
    paddingHorizontal: SPACE.s24,
    borderRadius: RADIUS.r24,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: withAlpha(COLORS.accent, ALPHA.a50),
    backgroundColor: withAlpha(COLORS.black, ALPHA.a35),
  },
  noTagsIcon: {
    width: SIZE.z56,
    height: SIZE.z56,
    borderRadius: RADIUS.r28,
    borderWidth: BORDER_WIDTH.w1_5,
    borderColor: COLORS.accent,
    backgroundColor: withAlpha(COLORS.accent, ALPHA.a12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  postedTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f22,
    lineHeight: LINE_HEIGHT.l28,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  postedSub: {
    color: withAlpha(COLORS.offWhite, ALPHA.a80),
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l22,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  controlsRow: {
    position: 'absolute',
    bottom: OFFSET.o32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s48,
  },
  flipButton: {
    width: SIZE.z44,
    height: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: SIZE.z72,
    height: SIZE.z72,
    borderRadius: RADIUS.r36,
    borderWidth: BORDER_WIDTH.w2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: SIZE.z4 },
    shadowOpacity: ALPHA.a25,
    shadowRadius: SHADOW_BLUR.b10,
    elevation: ELEVATION.e8,
  },
  shutterInner: {
    width: SIZE.z58,
    height: SIZE.z58,
    borderRadius: RADIUS.r29,
  },
  // Recording: the round button turns into a small red square (tap or let go to stop).
  shutterRecording: {
    width: SIZE.z28,
    height: SIZE.z28,
    borderRadius: RADIUS.r8,
    backgroundColor: COLORS.danger,
  },
  // The lens toggle and (video posts) the Photo / Video switch, side by side.
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
  },
  // ── 0.5× / 1× lens toggle ──────────────────────────────────────────────────
  lensToggleWrap: {
    position: 'absolute',
    bottom: LENS_TOGGLE_BOTTOM,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  lensToggle: {
    flexDirection: 'row',
    borderRadius: RADIUS.r20,
    padding: SPACE.s3,
    backgroundColor: withAlpha(COLORS.black, ALPHA.a35),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(COLORS.white, ALPHA.a18),
  },
  lensOption: {
    minWidth: SIZE.z44,
    height: SIZE.z30,
    paddingHorizontal: SPACE.s12,
    borderRadius: RADIUS.r17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lensOptionActive: {
    backgroundColor: COLORS.accent,
  },
  lensOptionText: {
    color: withAlpha(COLORS.white, ALPHA.a70),
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    letterSpacing: TRACKING.t1,
  },
  lensOptionTextActive: {
    color: COLORS.offBlack,
  },
  // ── Preview panel ─────────────────────────────────────────────────────────
  previewPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: COLORS.ink,
  },
  pip: {
    position: 'absolute',
    width: PIP_W,
    height: PIP_H,
    borderRadius: RADIUS.r12,
    overflow: 'hidden',
    borderWidth: BORDER_WIDTH.w2,
    borderColor: withAlpha(COLORS.white, ALPHA.a60),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: SIZE.z4 },
    shadowOpacity: ALPHA.a40,
    shadowRadius: SHADOW_BLUR.b8,
    elevation: ELEVATION.e8,
  },
  pipVideo: {
    borderRadius: RADIUS.r12,
    overflow: 'hidden',
  },
  // Video posts: the sound button mirrors the discard ✕, top left.
  previewSound: {
    position: 'absolute',
    left: OFFSET.o24,
  },
  discardButton: {
    position: 'absolute',
    right: OFFSET.o24,
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    backgroundColor: withAlpha(COLORS.white, ALPHA.a90),
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardX: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
    lineHeight: LINE_HEIGHT.l16,
  },
  postButtonFloat: {
    position: 'absolute',
    bottom: OFFSET.o32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  postButton: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s20,
    paddingHorizontal: SPACE.s56,
  },
  postButtonText: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.f17,
    fontFamily: FONTS.semiBold,
  },
  captionPill: {
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    paddingHorizontal: SPACE.s18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Without Liquid Glass: the hairline edge and dark wash that glass draws for itself.
  captionPillFill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(COLORS.white, ALPHA.a18),
    backgroundColor: withAlpha(COLORS.black, ALPHA.a35),
  },
  captionPillText: {
    color: withAlpha(COLORS.white, ALPHA.a75),
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
  },
  // Location pill in its opted-in (ON) state — fills with the accent so the
  // explicit opt-in reads at a glance. Mirrors lensOptionActive's accent fill.
  locationPillActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  // ── Caption bottom sheet
  sheetFlex: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: withAlpha(COLORS.black, ALPHA.a55),
  },
  sheetPanel: {
    backgroundColor: COLORS.bgDark,
    borderTopLeftRadius: RADIUS.r24,
    borderTopRightRadius: RADIUS.r24,
    paddingHorizontal: SPACE.s20,
    paddingTop: SPACE.s12,
    // The closing KeyboardInset adds one more gap, so 12 here keeps 24 below Done.
    paddingBottom: SPACE.s12,
    gap: SPACE.s12,
  },
  // Tag sheet: fills the system page sheet; the results list takes the spare height.
  tagSheetPanel: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
    paddingHorizontal: SPACE.s20,
    paddingTop: SPACE.s20,
    paddingBottom: SPACE.s12,
    gap: SPACE.s12,
  },
  sheetHeaderEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
  },
  sheetHandle: {
    width: SIZE.z40,
    height: SIZE.z4,
    borderRadius: RADIUS.r2,
    backgroundColor: withAlpha(COLORS.white, ALPHA.a25),
    alignSelf: 'center',
    marginBottom: SPACE.s4,
  },
  sheetLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetLabel: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f17,
    fontFamily: FONTS.semiBold,
  },
  sheetCounter: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
  },
  sheetInput: {
    minHeight: SIZE.z96,
    maxHeight: SIZE.z160,
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.regular,
    paddingVertical: SPACE.s8,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(COLORS.white, ALPHA.a15),
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
    paddingHorizontal: SPACE.s20,
    paddingVertical: SPACE.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(COLORS.offWhite, ALPHA.a12),
  },
  inviteLabel: {
    flex: 1,
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
  },
  inviteSteppers: {
    flexDirection: 'row',
    gap: SPACE.s8,
  },
  inviteStep: {
    width: SIZE.z32,
    height: SIZE.z32,
    borderRadius: RADIUS.r16,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: withAlpha(COLORS.offWhite, ALPHA.a40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteStepText: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.semiBold,
    lineHeight: LINE_HEIGHT.l20,
  },
  sheetDone: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s16,
    alignItems: 'center',
    marginTop: SPACE.s4,
  },
  sheetDoneText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
  },
  // ── Tag sheet (search + user rows)
  sheetCloseX: {
    width: SIZE.z28,
    height: SIZE.z28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseXText: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.semiBold,
  },
  tagSearchInput: {
    height: SIZE.z44,
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.regular,
    paddingHorizontal: SPACE.s14,
    borderRadius: RADIUS.r50,
    backgroundColor: withAlpha(COLORS.white, ALPHA.a08),
  },
  tagResultsList: {
    flex: 1,
  },
  tagEmptyText: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingVertical: SPACE.s16,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s4,
    paddingVertical: SPACE.s10,
    gap: SPACE.s12,
  },
  tagRowSelected: {
    backgroundColor: withAlpha(COLORS.accent, ALPHA.a08),
    borderRadius: RADIUS.r8,
  },
  tagAvatar: {
    width: SIZE.z38,
    height: SIZE.z38,
    borderRadius: RADIUS.r19,
  },
  tagAvatarFallback: {
    backgroundColor: COLORS.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAvatarInitial: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
  },
  tagRowName: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
  },
  tagRowHandle: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
    marginTop: SPACE.s1,
  },
  tagRowNudge: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.semiBold,
    letterSpacing: TRACKING.t1,
    marginTop: SPACE.s2,
  },
  tagRowCheck: {
    color: COLORS.accent,
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.semiBold,
  },
  // ── Permissions ───────────────────────────────────────────────────────────
  permissionCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s24,
  },
  deniedMessage: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    opacity: ALPHA.a80,
    paddingHorizontal: SPACE.s32,
  },
  permissionButton: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s20,
    paddingHorizontal: SPACE.s40,
  },
  permissionButtonText: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
  },
});
