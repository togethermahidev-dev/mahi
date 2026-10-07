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
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  getMatesOnClock,
  getTaggableFriends,
  removePostPhotos,
  uploadPostMedia,
  type TaggedUser,
  type FeedPost,
  type TaggableFriend,
  type MateOnClock,
} from '@/api';
import TaggedBubbleStack from '@/components/TaggedBubbleStack';
import OpenTagsBanner from '@/components/OpenTagsBanner';
import { CameraIcon } from '@/components/ScreenIcons';
import {
  pointCelebration,
  pointsCount,
  pointsRowText,
  pointsValue,
  postedToast,
} from '@/lib/mahiPoints';
import { matesOnClock } from '@/lib/openTagsBanner';
import { useSecondTick } from '@/hooks/useSecondTick';
import KeyboardInset from '@/components/KeyboardInset';
import { EmojiKeyboardButton, EmojiPanel, useEmojiKeyboard } from '@/components/EmojiKeyboard';
import { FREE_TEXT_PREDICTION } from '@/lib/emojiKeyboard';
import WorkoutIdeasSheet from '@/components/WorkoutIdeasSheet';
import FlashButton from '@/components/FlashButton';
import FocusSquare, { FOCUS_SQUARE_SIZE, type FocusTap } from '@/components/FocusSquare';
import CapturePipGuide from '@/components/CapturePipGuide';
import PostVideo, { SoundButton } from '@/components/PostVideo';
import InviteStep from '@/components/InviteStep';
import MateCircles from '@/components/MateCircles';
import InviteShareSheet from '@/components/InviteShareSheet';
import TagSlotsSheet from '@/components/TagSlotsSheet';
import MyInvitesSheet from '@/components/MyInvitesSheet';
import FindMatesSheet from '@/components/FindMatesSheet';
import { useContactsFinder } from '@/hooks/useContactsFinder';
import CountBadge from '@/components/CountBadge';
import { getMyInvites } from '@/api/invites';
import { inviteBadgeCount } from '@/lib/myInvites';
import { getTagSlots } from '@/api/tagSlots';
import { inviteAMate, noteInviteSent } from '@/lib/inviteAMate';
import {
  inviteBlockedReason,
  postButtonLabel,
  postConfirmText,
  postRefusal,
  type ScreenSlot,
} from '@/lib/tagSlots';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useCoachAnchor } from '@/hooks/useCoachMarks';
import CoachMarkHost from '@/components/CoachMark';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useVideoPosts } from '@/hooks/useVideoPosts';
import { usePageSize, useRailRoom, useTabBarRoom } from '@/hooks/useChrome';
import { cameraLift } from '@/lib/nativeTabs';
import {
  HOLD_TO_RECORD_MS,
  VIDEO_RECORDING,
  discardTitle,
  recordingFailedText,
  TOO_SHORT_SECONDS,
  recordingLabel,
  secondsLeft,
  shutterHint,
  shutterHintKey,
  SHUTTER_HINT_TIMES,
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
import { answersATag, hasPostedBefore, reactivePostingGate } from '@/lib/reactivePosting';
import { nudgeLabel } from '@/lib/tagNudge';
import { cantTagReason, postTagsRequired } from '@/lib/tagRules';
import { inviteList, inviteShareMessage, markInvite, type InviteItem } from '@/lib/inviteShare';
import { tagSheetStep } from '@/lib/inviteStep';
import {
  captureLabel as captureLabelFor,
  captureStepLabel,
  pipGuide,
  previewPipRestTop,
  type CaptureState,
} from '@/lib/captureGuide';
import { reportError } from '@/lib/sentry';
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
  MOTION,
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
import { cameraCornerTop } from '@/lib/pip';
import PointCelebration, { type PointCelebrationContent } from '@/components/PointCelebration';
import { PullHandle, useCameraPull } from '@/components/CameraPull';
import PointFlight, { type Flight } from '@/components/PointFlight';
import RollingNumber from '@/components/RollingNumber';
import AnswerStamp from '@/components/AnswerStamp';
import { answeredStamp } from '@/lib/answerStamp';
import { flightCard, pointMoment, pointsRoll, willFly } from '@/lib/pointMoments';
import { openTagsTop } from '@/lib/pip';

/**
 * The camera when there's no open tag to answer: says how Mahi works (reactive posting) and what
 * comes next, never a dead end (the refusal toast's words live in postRefusal).
 */
const NO_TAGS_TITLE = 'Waiting for a mate to tag you';
const NO_TAGS_LINE =
  'On Mahi you post when a mate tags you, so you keep each other going. Answer within 48 hours to earn a Mahi point.';
/** The locked camera with no tag, with Find friends under it. */
const QUIET_LINE =
  'On Mahi you post when a mate tags you, so you keep each other going. More mates means more tags.';
/** The tags or the feed couldn't be read (no connection). */
const OFFLINE_TITLE = 'Couldn’t reach Mahi';
const OFFLINE_LINE = 'Check your connection. Your tags will show here.';

/** 36-tall pills and buttons reach 44 with 4 above and below (rows sit 12 apart, so no overlap). */
const SLOP_PILL = { top: OFFSET.o4, bottom: OFFSET.o4 };
/** The 28-wide sheet close × reaches 44 all round. */
const SLOP_CLOSE = { top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 };
/** The 30-tall lens options reach 44 (no side slop: the two options touch). */
const SLOP_LENS = { top: OFFSET.o8, bottom: OFFSET.o6 };

/** The flash setting, kept for this app session only (never saved on the phone). */
let flashThisSession: FlashChoice = 'off';

// ─── Points counter ───────────────────────────────────────────────────────────

/** Top of the top-right corner items (points counter, discard ✕): just below the status bar. */
function topRightY(insetTop: number): number {
  return cameraCornerTop(insetTop);
}

/**
 * Your Mahi points, in the top-right corner of the live camera. `null` until your profile has
 * loaded: a muted dash, never a 0 that then changes. The number lands (zoom + fade) the first
 * time it's known, and pops a little when it goes up; with Reduce Motion it only fades.
 */
function PointsCounter({
  count,
  anchorRef,
}: {
  count: number | null;
  /** Where the points tip points (one-time tip). */
  anchorRef?: React.Ref<View>;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const scaleAnim = useRef(new Animated.Value(reduceMotion ? 1 : SCALE.s4)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const lastCount = useRef<number | null>(null);
  const known = count !== null;
  // Kill switches: Apple's rolling digits come with the +1 flying in; the roll down after a miss.
  const appleDigits = useFeatureFlag('point-fly-in');
  const missRoll = useFeatureFlag('miss-roll-down');

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

  // A point earned: a small pop from the number (none with Reduce Motion). After a miss the
  // number rolls down instead, felt once as a soft warning, never in red.
  useEffect(() => {
    const before = lastCount.current;
    lastCount.current = count;
    const way = pointsRoll(before, count);
    if (way === 'down' && missRoll) haptic('warning');
    if (way !== 'up' || reduceMotion) return;
    scaleAnim.setValue(SCALE.s1_3);
    Animated.spring(scaleAnim, { toValue: 1, ...SPRING.land, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    // The tip measures this still frame, not the pill inside it: the pill's landing zoom (from 4×)
    // would otherwise be measured instead of where it rests.
    <View
      ref={anchorRef}
      collapsable={false}
      pointerEvents="box-none"
      style={[styles.pointsSpot, { top: topRightY(insets.top) }]}
    >
      <Animated.View
        style={[styles.pointsCounter, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
        accessible
        accessibilityLabel={known ? `Mahi points: ${pointsCount(count)}` : 'Mahi points loading'}
      >
        {/* This compact status chip grows only up to large text, so it stays clear of the header
          and the open-tag pill at the largest settings. */}
        <RollingNumber
          value={count}
          style={[styles.pointsNumber, !known && { color: themeColors(true).muted }]}
          font={{ family: FONTS.bold, size: FONT_SIZE.f20, color: COLORS.white }}
          maxFontSizeMultiplier={LAYOUT.largeTextScale}
          appleDigits={appleDigits}
          rollDown={missRoll}
        />
        <Text style={styles.pointsLabel}>Mahi points</Text>
      </Animated.View>
    </View>
  );
}

// ─── Waiting card words ───────────────────────────────────────────────────────

/**
 * The words on the camera's no-tag card. While your own tags are running it says who is on the
 * clock and ticks (usability walkthrough, 2026-10-07), in its own component so only these words
 * re-render each second. `mates` is null while the server is asked: a spinner, never words that
 * then change. `points` is the "4 Mahi points · Best 6" row (the points pill sits under the
 * card's blur).
 */
function WaitingCardWords({
  title,
  line,
  mates,
  points,
}: {
  title: string;
  line: string;
  mates: { list: MateOnClock[]; offsetMs: number } | null | undefined;
  points: string | null;
}) {
  const ticking = !!mates && mates.list.length > 0;
  const deviceNow = useSecondTick(ticking);
  if (mates === null) {
    return (
      <View
        style={styles.noTagsWords}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Checking your tags"
      >
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  const onClock = mates
    ? matesOnClock({ mates: mates.list, serverOffsetMs: mates.offsetMs, deviceNow })
    : null;
  const t = onClock?.title ?? title;
  const l = onClock?.line ?? line;
  return (
    <View
      style={styles.noTagsWords}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${t}. ${l}${points ? ` ${points}.` : ''}`}
    >
      <View style={styles.noTagsIcon}>
        <CameraIcon size={ICON_SIZE.i24} color={COLORS.accent} />
      </View>
      <Text style={styles.postedTitle}>{t}</Text>
      <Text style={styles.postedSub}>{l}</Text>
      {points ? <Text style={styles.waitingPoints}>{points}</Text> : null}
    </View>
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
/**
 * How far the camera's controls reach up from the bottom of the page: the lens switch's row (36
 * tall) on top of the shutter row. Toasts on the Camera page sit above this.
 */
export const CAMERA_CONTROLS_TOP = LENS_TOGGLE_BOTTOM + SIZE.z36;

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
  if (tagged.length === 0) return others === 1 ? '1 link' : `${others} links`;
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
  /** Usernames whose open tags this post answers, soonest first (empty: it answers none). */
  answering: string[];
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
  answering,
  locationEnabled,
  onToggleLocation,
}: DualPhotoPreviewProps) {
  const maxTags = useTagStore((s) => s.maxTags);
  const insets = useSafeAreaInsets();
  // An invite fills a slot just as a friend does.
  const tagsMissing = Math.max(0, requiredTags - taggedUsers.length - inviteCount - slots.length);
  const postLabel = postButtonLabel(
    tagsMissing,
    taggedUsers.length + inviteCount + slots.length > 0
  );
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [modalOpen, setModalOpen] = useState(false);

  // Which photo is the full-screen background: 'rear' or 'front'
  const [primaryFacing, setPrimaryFacing] = useState<'rear' | 'front'>('rear');
  // Video posts: the big video's sound. Every preview starts muted.
  const [previewMuted, setPreviewMuted] = useState(true);
  // "Answered @sam", pressed onto the photo as an answer posts; cleared for the next preview.
  const [stamp, setStamp] = useState<string | null>(null);
  const stampOn = useFeatureFlag('answered-stamp');
  useEffect(() => {
    if (frontPhoto) setStamp(null);
  }, [frontPhoto]);

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
  // One-time tip on the tag pill, the first time the preview is up with no sheet over it.
  const tagTip = useCoachAnchor('tagMates', modalOpen && activeSheet === 'none' && !isUploading);

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

          {stamp ? <AnswerStamp text={stamp} /> : null}

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
                ref={tagTip}
                accessibilityRole="button"
                accessibilityLabel={
                  taggedUsers.length + slots.length > 0
                    ? `Tagged: ${tagPillLabel(taggedUsers, slots.length)}`
                    : 'Tag people'
                }
                accessibilityHint="Opens the tag list"
                accessibilityState={{ disabled: isUploading }}
                hitSlop={SLOP_PILL}
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
                accessibilityRole="button"
                accessibilityLabel={caption.trim() ? `Caption: ${caption.trim()}` : 'Add a caption'}
                accessibilityState={{ disabled: isUploading }}
                hitSlop={SLOP_PILL}
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
                accessibilityState={{ checked: locationEnabled, disabled: isUploading }}
                hitSlop={SLOP_PILL}
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
              accessibilityRole="button"
              accessibilityLabel={postLabel}
              accessibilityHint={tagsMissing > 0 ? 'Opens the tag list' : undefined}
              accessibilityState={{ disabled: isUploading, busy: isUploading }}
              style={({ pressed }) => [
                styles.postButton,
                isUploading && { opacity: ALPHA.a50 },
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
                  const confirm = postConfirmText({
                    answering,
                    anyTagged: taggedUsers.length + inviteCount + slots.length > 0,
                  });
                  Alert.alert(
                    confirm.title,
                    confirm.body,
                    [
                      { text: 'Keep editing', style: 'cancel' },
                      {
                        text: 'Post',
                        onPress: () => {
                          const front = frozenFront.current!;
                          const rear = frozenRear.current!;
                          // An answer gets its stamp first; the photo lifts away after a beat.
                          const words = stampOn ? answeredStamp(answering) : null;
                          if (!words) return onPost(front, rear);
                          setStamp(words);
                          setTimeout(() => onPost(front, rear), MOTION.stampHoldMs);
                        },
                      },
                    ],
                    { cancelable: true }
                  );
                }
              }}
            >
              <Text style={styles.postButtonText}>{postLabel}</Text>
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
          tagsOptional={requiredTags === 0}
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

        {/* The preview is its own window: its one-time tip shows here. */}
        <CoachMarkHost compose />
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
  // "Need an idea?": what counts as a workout, over this sheet.
  const [ideasOpen, setIdeasOpen] = useState(false);
  const cursorRef = useRef(0);
  const inputRef = useRef<TextInput>(null);
  const emoji = useEmojiKeyboard(inputRef);

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
        {/* Tapping outside saves, like Done; Done is the one VoiceOver reads. */}
        <Pressable
          style={styles.sheetScrim}
          onPress={commit}
          accessible={false}
          importantForAccessibility="no"
        />
        <View style={styles.sheetPanel}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetLabelRow}>
            <Text style={styles.sheetLabel}>Caption</Text>
            <View style={styles.sheetHeaderEnd}>
              <Text style={styles.sheetCounter}>{draft.length}/200</Text>
              <EmojiKeyboardButton emoji={emoji} color={COLORS.offWhite} />
            </View>
          </View>
          <TextInput
            ref={inputRef}
            style={styles.sheetInput}
            value={draft}
            onChangeText={handleChangeText}
            onSelectionChange={(e) => {
              cursorRef.current = e.nativeEvent.selection.end;
            }}
            placeholder="What did you do? Any workout counts."
            placeholderTextColor={themeColors(true).muted}
            multiline
            maxLength={200}
            autoFocus
            keyboardAppearance="dark"
            textAlignVertical="top"
            onBlur={emoji.onBlur}
            {...FREE_TEXT_PREDICTION}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Shows workouts that count"
            style={({ pressed }) => [styles.ideaLink, pressed && { opacity: ALPHA.a70 }]}
            onPress={() => {
              Keyboard.dismiss();
              setIdeasOpen(true);
            }}
          >
            <Text style={styles.ideaLinkText}>Need an idea?</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.sheetDone, pressed && { opacity: ALPHA.a85 }]}
            onPress={commit}
          >
            <Text style={styles.sheetDoneText}>Done</Text>
          </Pressable>
          <EmojiPanel emoji={emoji} />
          <KeyboardInset />
        </View>
      </View>
      {/* Inside this modal so it opens over it. */}
      <WorkoutIdeasSheet visible={ideasOpen} onClose={() => setIdeasOpen(false)} />
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
  const initial = (display[0] ?? '?').toUpperCase();
  const nudgeDays = useTagStore((s) => s.nudgeDays);
  const { accent } = useAppTheme().colors;
  const nudge = nudgeLabel(item.last_tagged_at, item.has_open_tag, nudgeDays);
  const reason = cantTagReason(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${display}, @${item.username}${reason ? `, ${reason}` : ''}`}
      accessibilityState={{ selected, disabled: item.has_open_tag }}
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
        <Image source={{ uri: item.avatar_url, cache: 'force-cache' }} style={styles.tagAvatar} />
      ) : (
        <View style={[styles.tagAvatar, styles.tagAvatarFallback]}>
          <Text style={styles.tagAvatarInitial}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        {/* No points here: a friend's 0 would broadcast their miss (#88), and who to tag is about
            who you train with, not a score. */}
        <Text style={styles.tagRowName}>{display}</Text>
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
  /** This post needs no tags (a first post that answers a tag). */
  tagsOptional?: boolean;
}

function TagSheet({
  visible,
  initialSelected,
  initialInvites,
  onCancel,
  onCommit,
  singleShot,
  tagsOptional = false,
}: TagSheetProps) {
  const [selected, setSelected] = useState<TaggedUser[]>(initialSelected);
  const [invites, setInvites] = useState(initialInvites);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TaggableFriend[]>([]);
  const maxTags = useTagStore((s) => s.maxTags);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<TextInput>(null);
  const filled = selected.length + invites;
  // Friends who can be tagged right now (from the unfiltered list); null until it has loaded.
  const [availableFriends, setAvailableFriends] = useState<number | null>(null);
  const inviteBlocked = inviteBlockedReason({
    filled,
    maxTags,
  });
  const addInvite = () => {
    if (inviteBlocked) {
      haptic('warning');
      useToastStore.getState().show(inviteBlocked);
      return;
    }
    // The mate circles feel each one filling.
    setInvites((n) => n + 1);
  };
  const step = tagSheetStep({
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

  // The keyboard waits until we know friends can fill the slots, so it never covers the step.
  const stepIsFriends = step === 'friends';
  useEffect(() => {
    if (visible && stepIsFriends) searchRef.current?.focus();
  }, [visible, stepIsFriends]);

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
        const { data, error } = await getTaggableFriends(q, 50);
        if (error) {
          reportError(error, {
            flow: 'tags',
            action: 'loadTaggableFriends',
            level: 'warning',
            extra: { queryLength: q.length },
          });
        }
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
              hitSlop={SLOP_CLOSE}
              style={({ pressed }) => [styles.sheetCloseX, pressed && { opacity: ALPHA.a70 }]}
              onPress={onCancel}
            >
              <Text style={styles.sheetCloseXText}>×</Text>
            </Pressable>
          </View>
        </View>

        {singleShot ? null : (
          <View style={styles.tagCircles}>
            <MateCircles
              total={maxTags}
              friends={selected}
              links={invites}
              dark
              onAdd={step === 'invite' ? addInvite : () => searchRef.current?.focus()}
              onRemove={(circle) =>
                circle.kind === 'friend'
                  ? setSelected((prev) => prev.filter((u) => u.user_id !== circle.userId))
                  : setInvites((n) => Math.max(0, n - 1))
              }
            />
          </View>
        )}

        {step === 'invite' && availableFriends !== null ? (
          <InviteStep
            maxTags={maxTags}
            availableFriends={availableFriends}
            friends={selected.length}
            invites={invites}
            tagsOptional={tagsOptional}
            onAdd={addInvite}
            onRemove={() => setInvites((n) => Math.max(0, n - 1))}
          />
        ) : null}

        <TextInput
          ref={searchRef}
          style={styles.tagSearchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search your friends"
          placeholderTextColor={themeColors(true).muted}
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
                    ? 'Follow each other and you can tag each other.'
                    : 'Follow each other and you can tag each other.'}
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

        {singleShot || step !== 'friends' ? null : (
          <View style={styles.inviteRow}>
            <Text style={styles.inviteLabel}>
              {invites > 0
                ? `${invites === 1 ? '1 link' : `${invites} links`} to send after you post.`
                : inviteBlocked && filled < maxTags
                  ? `Not on Mahi yet? ${inviteBlocked}, then send a link.`
                  : 'Not on Mahi yet? Send them a link instead.'}
            </Text>
            <View style={styles.inviteSteppers}>
              {invites > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove a link"
                  style={({ pressed }) => [
                    styles.inviteStepTarget,
                    pressed && { opacity: ALPHA.a70 },
                  ]}
                  onPress={() => setInvites((n) => Math.max(0, n - 1))}
                >
                  <View style={styles.inviteStep}>
                    <Text style={styles.inviteStepText}>−</Text>
                  </View>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a link"
                accessibilityState={{ disabled: filled >= maxTags }}
                style={({ pressed }) => [
                  styles.inviteStepTarget,
                  { opacity: filled >= maxTags ? ALPHA.a30 : 1 },
                  pressed && { opacity: ALPHA.a70 },
                ]}
                disabled={filled >= maxTags}
                onPress={addInvite}
              >
                <View style={styles.inviteStep}>
                  <Text style={styles.inviteStepText}>+</Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}

        {singleShot ? null : (
          <Pressable
            accessibilityRole="button"
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

// ─── CameraScreen ─────────────────────────────────────────────────────────────

interface CameraScreenProps {
  /** Apple's tab bar: the post preview opened or closed (the bar hides while it is open). */
  onComposingChange?: (open: boolean) => void;
  /** Go to the Feed page (the caught-up card's "See your feed", shown while the feed is open). */
  onSeeFeed?: () => void;
  /** Open people search (the caught-up card's "Find friends", shown while the feed is locked). */
  onFindFriends?: () => void;
  /** Open someone's profile (the answer toast's "Cheer @sam on", for the friend whose tag it answered). */
  onOpenProfile?: (userId: string) => void;
}

export default function CameraScreen({
  onComposingChange,
  onSeeFeed,
  onFindFriends,
  onOpenProfile,
}: CameraScreenProps = {}): React.JSX.Element {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  // Read when the answer toast's button is tapped, seconds after the post went.
  const onOpenProfileRef = useRef(onOpenProfile);
  onOpenProfileRef.current = onOpenProfile;
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
  // Flag `tag-slots`: slots filled on the tag screen before posting. Read fresh from the server
  // whenever a preview opens — never kept on the phone (they expire).
  const tagSlotsOn = useFeatureFlag('tag-slots');
  const [slots, setSlots] = useState<ScreenSlot[]>([]);
  // The last post's invite links and which are sent. In memory only — links expire.
  const [postInvites, setPostInvites] = useState<InviteItem[]>([]);
  // The point-earned moment after a post, and the invite links waiting until it closes.
  const [celebration, setCelebration] = useState<PointCelebrationContent | null>(null);
  const invitesAfterCelebration = useRef<InviteItem[]>([]);
  // A later answer's point flies into the counter (#116); until it lands the counter keeps the
  // number it had when Post was pressed.
  const [flight, setFlight] = useState<Flight | null>(null);
  const [heldPoints, setHeldPoints] = useState<number | null>(null);
  const rootRef = useRef<View>(null);
  // Kill switch: off, every point gets today's full-screen moment.
  const flyOn = useFeatureFlag('point-fly-in');
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

  // Reactive posting: your first post, then only while a friend's tag is open. The server's
  // permanent "has posted before" mark decides (deleting every post never gives the free post
  // back); a post of yours in the feed counts straight away. Nothing here is kept on the device.
  const feedLoaded = useFeedStore((s) => s.loaded);
  const unlockedUntil = useFeedStore((s) => s.unlockedUntil);
  const feedOpen = useFeedStore((s) => s.loaded && !s.locked);
  const hasPosted = hasPostedBefore({
    profileMark: profile ? (profile.has_posted_before ?? false) : null,
    feedLoaded,
    unlockedUntil,
  });
  const gate = reactivePostingGate({
    hasPosted,
    tagsLoaded,
    openTags,
    serverOffsetMs,
  });
  const blocked = gate !== 'open';
  // A first post that answers a mate's tag may tag nobody; every other post tags `requiredTags`.
  const postRequiredTags = postTagsRequired(requiredTags, {
    firstPost: hasPosted === null ? null : !hasPosted,
    answersTag: answersATag(openTags, serverOffsetMs),
  });
  // Offline at the gym: a failed read would otherwise leave the shutter spinning forever. Say so,
  // with Try again (re-reads the tags and the feed), instead of a spinner with no words.
  const tagsError = useTagStore((s) => s.openTagsError);
  const feedError = useFeedStore((s) => !s.loaded && s.error !== null);
  const tagsSyncing = useTagStore((s) => s.isSyncing);
  const feedSyncing = useFeedStore((s) => s.isSyncing);
  const retrying = tagsSyncing || feedSyncing;
  const offline = gate === 'loading' && (tagsError || feedError);
  const card: {
    title: string;
    line: string;
    button: { label: string; onPress: () => void; busy?: boolean } | null;
  } = offline
    ? {
        title: OFFLINE_TITLE,
        line: OFFLINE_LINE,
        button: {
          label: 'Try again',
          busy: retrying,
          onPress: () => {
            useTagStore.getState().syncOpenTags();
            useFeedStore.getState().sync(true);
          },
        },
      }
    : feedOpen
      ? {
          title: NO_TAGS_TITLE,
          line: NO_TAGS_LINE,
          button: onSeeFeed ? { label: 'See your feed', onPress: onSeeFeed } : null,
        }
      : {
          // Locked feed and nothing to answer (after a miss, or friends gone quiet): the way
          // forward is more friends, as on the feed's lock card (#77).
          title: NO_TAGS_TITLE,
          line: onFindFriends ? QUIET_LINE : NO_TAGS_LINE,
          button: onFindFriends ? { label: 'Find friends', onPress: onFindFriends } : null,
        };

  // Nothing to answer: you can still bring a mate in (owner, 2026-10-07). A link with no tag
  // behind it, made on tap; joining from it makes you follow each other, and no tag starts.
  const [invitingMate, setInvitingMate] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  // "Find your mates" from contacts (build 13+, no switch).
  const contactsFinder = useContactsFinder();
  const [findMatesOpen, setFindMatesOpen] = useState(false);
  // The number on "See your invites": read fresh each time the waiting card shows (and after the
  // list closes), never kept on the phone; no number until the server has answered.
  const [myInviteCount, setMyInviteCount] = useState<number | null>(null);
  const waitingCard = gate === 'closed' && !offline;
  // Your mates on the clock: read fresh each time the waiting card shows, never kept on the phone.
  // null while asking (the card shows a spinner, not words that then change); a failed read
  // falls back to "Waiting for a mate to tag you".
  const [mates, setMates] = useState<{ list: MateOnClock[]; offsetMs: number } | null>(null);
  useEffect(() => {
    if (!waitingCard) {
      setMates(null);
      return;
    }
    let live = true;
    void getMatesOnClock().then(({ data }) => {
      if (!live) return;
      const list = data ?? [];
      const offsetMs = list[0] ? Date.parse(list[0].server_now) - Date.now() : 0;
      setMates({ list, offsetMs });
    });
    return () => {
      live = false;
    };
  }, [waitingCard]);
  useEffect(() => {
    if (!waitingCard || invitesOpen) return;
    let live = true;
    void getMyInvites().then(({ data }) => {
      // A failed read shows no number (the list itself says what went wrong when opened).
      if (live) setMyInviteCount(data ? inviteBadgeCount(data) : null);
    });
    return () => {
      live = false;
    };
  }, [waitingCard, invitesOpen]);

  const inviteMate = async () => {
    if (invitingMate) return;
    setInvitingMate(true);
    try {
      await inviteAMate();
    } finally {
      setInvitingMate(false);
    }
  };

  // One-time tips: the points pill, the shutter (two photos) and the waiting card. The points
  // pill is drawn under the waiting card's frosted cover, so its tip waits for an open camera.
  const cameraOn = cameraPermission?.granted === true;
  const pointsTip = useCoachAnchor(
    'points',
    cameraOn && gate === 'open' && pointsCountNow !== null
  );
  const shutterTip = useCoachAnchor(
    'twoPhotos',
    cameraOn && !blocked && captureState === 'idle' && guidePhotoUri === null
  );
  const waitingTip = useCoachAnchor('waiting', cameraOn && gate === 'closed' && !offline);
  // The waiting camera gives a little when pulled down, showing the card "behind" it (#115).
  const safeTop = useSafeAreaInsets().top;
  const { fontScale } = useWindowDimensions();
  const pullOn = useFeatureFlag('camera-pull-down') && cameraOn && waitingCard;
  const pull = useCameraPull(pullOn, safeTop);
  const pullTip = useCoachAnchor('pullDown', pullOn);

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
      reportError(err, {
        flow: 'camera',
        action: 'availableLenses',
        level: 'warning',
        extra: { facing },
      });
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
  /** This video was started by a hold (kept after letting go, for the "too short" wording). */
  const videoByHoldRef = useRef(false);

  // The first-time line that says what the shutter does (hold to record). Read from the phone
  // once video is on; null until read, so it never shows and then vanishes.
  const [hintUses, setHintUses] = useState<number | null>(null);
  useEffect(() => {
    if (!videoOn || !userId) return;
    let live = true;
    AsyncStorage.getItem(shutterHintKey(userId))
      .then((v) => {
        if (live) setHintUses(Number(v) || 0);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [videoOn, userId]);
  const countShutterHint = () => {
    if (!userId || hintUses === null || hintUses >= SHUTTER_HINT_TIMES) return;
    const next = hintUses + 1;
    setHintUses(next);
    AsyncStorage.setItem(shutterHintKey(userId), String(next)).catch(() => {});
  };

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
      const seconds = (Date.now() - startedAt) / 1000;
      const press = videoByHoldRef.current ? 'hold' : 'tap';
      if (seconds >= TOO_SHORT_SECONDS) {
        reportError(err, {
          flow: 'camera',
          action: 'recordVideo',
          extra: { seconds, press, facing },
        });
      }
      useToastStore.getState().show(recordingFailedText({ press, seconds }));
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
    if (videoOn) countShutterHint();
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
    videoByHoldRef.current = press === 'hold';
    if (await askMicIfNew()) {
      // The microphone question took the finger off the shutter.
      if (press === 'hold') {
        heldForVideoRef.current = false;
        useToastStore.getState().show('Hold the shutter again to record.');
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

  // A post that failed without a server refusal may still have gone through (the reply was
  // lost). Its photos come back to the preview with the same post id, so a retry is answered with
  // that same post instead of a second one (or a wrong "Your tag has ended"). Memory only.
  const retryRef = useRef<{ clientId: string; front: CapturedPhoto; rear: CapturedPhoto } | null>(
    null
  );
  // The toast's Try again posts with whatever the preview holds by then.
  const uploadRef = useRef<(front: CapturedPhoto, rear: CapturedPhoto) => Promise<void>>(
    async () => {}
  );
  const retryPost = () => {
    const retry = retryRef.current;
    if (retry) void uploadRef.current(retry.front, retry.rear);
  };

  // The "+1" springs up above the shutter and lands in the middle of the points counter.
  const launchFlight = (card: Omit<Flight, 'id' | 'from' | 'to' | 'cardTop'>) => {
    const root = rootRef.current;
    const counter = pointsTip.current;
    const fallback = () => {
      setHeldPoints(null);
      hapticSequence(card.milestone ? ['pointsUp', 'milestone'] : ['pointsUp']);
      useToastStore.getState().show(`${card.title}. ${card.line}`, WAIT.toastLong);
    };
    if (!root || !counter) return fallback();
    root.measureInWindow((rx, ry, rw, rh) => {
      counter.measureInWindow((cx, cy, cw, ch) => {
        if (!rw || !cw) return fallback();
        setFlight({
          ...card,
          id: String(Date.now()),
          from: { x: rw / 2, y: rh - (OFFSET.o32 + lift) - SIZE.z120 },
          to: { x: cx - rx + cw / 2, y: cy - ry + ch / 2 },
          cardTop: openTagsTop(safeTop, fontScale) + SIZE.z44 + SPACE.s12,
        });
      });
    });
  };

  // Upload both photos, create post
  const uploadPhotos = async (front: CapturedPhoto, rear: CapturedPhoto) => {
    if (!userId || !profile) return;
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setIsUploading(true);
    haptic('postSent');

    const tempId = `pending_${Date.now()}`;
    // A Mahi point for your first ever post, or for a post that answers a tag (one either way).
    const firstPostNow = hasPosted === false;
    const optimisticPoints =
      profile.streak_current + (firstPostNow || answersATag(openTags, serverOffsetMs) ? 1 : 0);
    if (
      flyOn &&
      willFly({ firstPost: firstPostNow, answersTag: answersATag(openTags, serverOffsetMs) })
    ) {
      setHeldPoints(profile.streak_current);
    }
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

    // The same photos coming back after a failure keep their post id (create_post is idempotent
    // on it); new photos get a new one.
    const retry = retryRef.current;
    const clientId =
      retry && retry.front === front && retry.rear === rear ? retry.clientId : randomUUID();
    retryRef.current = null;
    let uploadedPaths: string[] = [];
    let step = 'readMedia';

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
      const rearBody = await bodyOf(rear);
      const frontBody = await bodyOf(front);
      step = 'upload';
      const { data: paths, error: uploadErr } = await uploadPostMedia({
        userId,
        clientId,
        rear: { shot: { kind: rear.kind, uri: rear.uri }, body: rearBody },
        front: { shot: { kind: front.kind, uri: front.uri }, body: frontBody },
      });
      if (uploadErr || !paths) throw uploadErr ?? new Error('upload failed');
      uploadedPaths = [paths.rearPath, paths.frontPath];

      // Per-post location: ONLY when the user opted in for this post. getCurrentLocation
      // returns null on denial, a too-coarse fix, or any error — and it already
      // rounds to ~city-block precision. A null here means we post with no coords;
      // location must NEVER block or crash the post.
      let coords: { latitude: number; longitude: number } | null = null;
      step = 'createPost';
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
      step = 'afterPost';

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
      // Tags reached friends, then (when the server says so) a Mahi point was earned. A point
      // that flies into the counter is felt when it lands instead.
      const moment = flyOn
        ? pointMoment({
            firstPost: firstPostNow,
            answered: result.answered.length,
            replayed: result.replayed === true,
          })
        : null;
      hapticSequence(
        postedMoments({
          tags: taggedUsersSnapshot.length + inviteCountSnapshot + slotsSnapshot.length,
          pointsBefore: profile.streak_current,
          pointsAfter: moment === 'fly' ? profile.streak_current : result.streak.streak_current,
          // A milestone line in the toast below gets a small success buzz too.
          bestBefore: profile.streak_highest,
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
          has_posted_before: true,
        });
      }

      track('tag_sent', {
        post_id: result.post.id,
        tag_count: taggedUsersSnapshot.length,
        invite_count: inviteCountSnapshot + slotsSnapshot.length,
        replayed: result.replayed === true,
      });
      for (const answered of result.answered) {
        track('tag_answered', {
          tagger_id: answered.tagger_id,
          seconds: answered.seconds,
          post_id: result.post.id,
          replayed: result.replayed === true,
        });
      }

      if (result.answered.length > 0 || firstPostNow) useUserStore.getState().refresh(userId);
      // An answer's toast offers a way to the friend whose tag it answered (the oldest one).
      const tagger = result.answered[0];
      const cheer =
        tagger && onOpenProfileRef.current
          ? {
              label: `Cheer @${tagger.username} on`,
              onPress: () => onOpenProfileRef.current?.(tagger.tagger_id),
            }
          : undefined;
      const taggedCounts = {
        friends: taggedUsersSnapshot.length + slotsSnapshot.filter((x) => x.kind !== 'link').length,
        links: inviteCountSnapshot + slotsSnapshot.filter((x) => x.kind === 'link').length,
      };
      // A post that earns a point gets its full-screen moment; any other post, the toast.
      const celebrate = result.replayed
        ? null
        : pointCelebration({
            answered: result.answered.map((a) => a.username),
            points: result.streak.streak_current,
            bestBefore: profile.streak_highest,
            firstPost: firstPostNow,
            // The mates whose 48 hours start now, named (in-app requests start once accepted).
            tagged: {
              ...taggedCounts,
              names: [
                ...taggedUsersSnapshot.map((u) => u.username),
                ...slotsSnapshot
                  .filter((x) => x.kind === 'friend' && x.username)
                  .map((x) => x.username as string),
              ],
            },
          });
      const invitesToSend = tagSlotsOn ? [] : inviteList(result.invites);
      useTagStore.getState().syncOpenTags();
      if (moment === 'fly') {
        // The invite list waits until the card has gone: one thing at a time.
        invitesAfterCelebration.current = invitesToSend;
        launchFlight({
          ...flightCard({
            tagger: tagger?.username ?? null,
            points: result.streak.streak_current,
            bestBefore: profile.streak_highest,
          }),
          cheer,
        });
        return;
      }
      setHeldPoints(null);
      if (celebrate) {
        // The invite list waits until the celebration is closed: one sheet at a time.
        invitesAfterCelebration.current = invitesToSend;
        setCelebration({ ...celebrate, cheer });
        return;
      }
      // Every other post says it worked: it opens the feed and says who it tagged.
      useToastStore.getState().show(
        postedToast({
          answered: result.answered.map((a) => a.username),
          points: result.streak.streak_current,
          // The best before this post (`profile` was read before posting).
          bestBefore: profile.streak_highest,
          tagged: taggedCounts,
        }),
        // A toast with a button stays long enough to reach it (at least as long as toastLong).
        cheer ? { action: cheer } : WAIT.toastLong
      );
      // A list to send any invite links from, one share sheet each, so none is silently lost.
      // (With tag slots on, links were shared on the tag screen; nothing is left to send.)
      setPostInvites(invitesToSend);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHeldPoints(null);
      haptic('error');
      useFeedStore.getState().removePending(tempId);
      const current = useUserStore.getState().profile;
      if (current) setProfile({ ...current, streak_current: profile.streak_current });
      // Say what to change, and give the photos back so the post can go again — except when
      // there's no tag to answer (reactive posting), which the preview can't fix.
      const refusal = postRefusal(message);
      // Only a real refusal means no post points at the uploads. A lost reply may have posted.
      if (refusal.refused) removePostPhotos(uploadedPaths).catch(() => {});
      if (refusal.refused) {
        useToastStore.getState().show(refusal.text, WAIT.toastLong);
      } else {
        useToastStore
          .getState()
          .show(refusal.text, { action: { label: 'Try again', onPress: retryPost } });
      }
      if (refusal.keepPhotos) {
        retryRef.current = { clientId, front, rear };
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
        reportError(err, {
          flow: 'camera',
          action: 'upload',
          extra: {
            userId,
            clientId,
            step,
            retry: retry?.clientId === clientId,
            rearType: rear.kind,
            frontType: front.kind,
            tags: taggedUsersSnapshot.length,
            invites: inviteCountSnapshot,
            slots: slotsSnapshot.length,
          },
        });
      }
    } finally {
      uploadingRef.current = false;
    }
  };

  useEffect(() => {
    uploadRef.current = uploadPhotos;
  });

  const hasPreview = frontPhoto !== null && rearPhoto !== null;
  useEffect(() => {
    if (hasPreview) useTagStore.getState().loadRequirement();
  }, [hasPreview]);
  // Slots made earlier (still open on the server) fill this post's slots too.
  useEffect(() => {
    if (!hasPreview || !tagSlotsOn) return;
    let stale = false;
    getTagSlots().then(({ data, error }) => {
      if (error) reportError(error, { flow: 'tags', action: 'loadSlotsForPost', level: 'warning' });
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
      if (shared) {
        track('invite_shared', {});
        noteInviteSent(token, 'share');
      }
      setPostInvites((list) => markInvite(list, token, shared));
    } catch (e) {
      reportError(e, { flow: 'invites', action: 'sendInvite' });
      useToastStore.getState().show('Couldn’t open sharing. Try again.');
    }
  };

  const handleDiscard = () => {
    // Uploads from a failed try stay: a lost reply may mean that post is live and uses them.
    retryRef.current = null;
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
    : captureLabelFor(captureState, facing, videoOn ? shotMode : 'photo');
  const captureStep = captureStepLabel(captureState, facing);
  const hintText =
    !captureLabel &&
    captureState === 'idle' &&
    gate === 'open' &&
    hintUses !== null &&
    hintUses < SHUTTER_HINT_TIMES
      ? shutterHint({ videoOn, mode: shotMode })
      : null;

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
    const cameraDenied = cameraPermission.status === 'denied';
    const settingsOnly = cameraDenied && !cameraPermission.canAskAgain;
    return (
      <View style={styles.root}>
        <View style={styles.permissionCenter}>
          <View style={styles.permissionCard}>
            <View style={styles.permissionIcon}>
              <CameraIcon size={ICON_SIZE.i32} color={COLORS.accent} />
            </View>
            <View style={styles.permissionCopy}>
              <Text style={styles.permissionEyebrow}>Camera access</Text>
              <Text style={styles.permissionTitle}>
                {settingsOnly ? 'Turn on your camera' : 'Share your workout'}
              </Text>
              <Text style={styles.deniedMessage}>
                {settingsOnly
                  ? 'Open your phone’s settings, allow Camera access for Mahi, then come back.'
                  : 'Mahi uses your camera to take the two photos in every workout post.'}
              </Text>
            </View>
            {/* Only once refused (not while the phone's own question is on its way): always a way on. */}
            {cameraDenied && (
              <Pressable
                accessibilityRole="button"
                accessibilityHint={
                  settingsOnly
                    ? 'Opens your phone’s settings'
                    : 'Shows the camera permission prompt'
                }
                style={({ pressed }) => [
                  styles.permissionButton,
                  pressed && { opacity: ALPHA.a80 },
                ]}
                onPress={() =>
                  cameraPermission.canAskAgain ? requestCameraPermission() : Linking.openSettings()
                }
              >
                <Text style={styles.permissionButtonText}>
                  {cameraPermission.canAskAgain ? 'Allow camera' : 'Open settings'}
                </Text>
              </Pressable>
            )}
            <Text style={styles.permissionNote}>
              Your camera stays off until you open this screen.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // The small window in the preview's photo-in-photo spot: what comes second, then the first photo.
  const guide = pipGuide({
    state: captureState,
    facing,
    hasFirstPhoto: guidePhotoUri !== null,
    blocked,
    cameraGranted,
  });

  return (
    <GestureDetector gesture={doubleTapToFlip}>
      <View ref={rootRef} collapsable={false} style={styles.root}>
        {/* The camera layer: pulled down a little while waiting (see CameraPull). */}
        <Reanimated.View style={[StyleSheet.absoluteFill, pull.cameraStyle]}>
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
        </Reanimated.View>

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

        <PointsCounter count={heldPoints ?? pointsCountNow} anchorRef={pointsTip} />

        {!blocked && (
          <OpenTagsBanner
            openTags={openTags}
            serverOffsetMs={serverOffsetMs}
            // Never posted (not even a deleted post): "First post · no tag needed".
            firstPost={hasPosted === false && tagsLoaded}
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

        {/* The first two times: what a tap and a hold on the shutter do (video posts only). */}
        {hintText && (
          <View style={styles.captureLabelWrap}>
            <Text style={[styles.captureLabel, styles.shutterHint]}>{hintText}</Text>
          </View>
        )}

        {/* Reactive posting: nothing to answer (or no connection to find out), so no shutter. */}
        {/* While a point flies into the counter the frost waits, so the counter stays clear. */}
        {(gate === 'closed' || offline) && !flight && heldPoints === null ? (
          <GestureDetector gesture={pull.gesture}>
            <View style={StyleSheet.absoluteFill}>
              {/* The frost moves with the camera; the card sits behind the glass. */}
              <Reanimated.View style={[StyleSheet.absoluteFill, pull.frostStyle]}>
                <BlurView
                  intensity={BLUR_INTENSITY.i60}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
              </Reanimated.View>
              <Reanimated.View style={[styles.postedOverlay, pull.behindStyle]}>
                <View ref={waitingTip} style={styles.noTagsCard}>
                  {/* The words read as one; the button is its own element. */}
                  <WaitingCardWords
                    title={card.title}
                    line={card.line}
                    // Offline: no server to ask, so the offline words straight away.
                    mates={waitingCard ? mates : undefined}
                    points={
                      waitingCard
                        ? pointsRowText(pointsCountNow, profile?.streak_highest ?? null)
                        : null
                    }
                  />
                  {card.button ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.seeFeedButton,
                        pressed && { opacity: ALPHA.a70 },
                      ]}
                      onPress={card.button.onPress}
                      disabled={card.button.busy}
                      accessibilityRole="button"
                      accessibilityLabel={card.button.label}
                      accessibilityState={{ busy: card.button.busy }}
                    >
                      {card.button.busy ? (
                        <ActivityIndicator color={COLORS.offBlack} />
                      ) : (
                        <Text style={styles.seeFeedText}>{card.button.label}</Text>
                      )}
                    </Pressable>
                  ) : null}
                  {gate === 'closed' && !offline ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.inviteMateButton,
                        pressed && { opacity: ALPHA.a70 },
                      ]}
                      onPress={() => void inviteMate()}
                      disabled={invitingMate}
                      accessibilityRole="button"
                      accessibilityLabel="Invite a mate"
                      accessibilityHint="Makes a link to share. When they join, you’ll follow each other."
                      accessibilityState={{ busy: invitingMate }}
                    >
                      {invitingMate ? (
                        <ActivityIndicator color={COLORS.accent} />
                      ) : (
                        <Text style={styles.inviteMateText}>Invite a mate</Text>
                      )}
                    </Pressable>
                  ) : null}
                  {gate === 'closed' && !offline ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.seeInvites,
                        pressed && { opacity: ALPHA.a70 },
                      ]}
                      onPress={() => setInvitesOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        myInviteCount ? `See your invites, ${myInviteCount}` : 'See your invites'
                      }
                      accessibilityHint="Shows the links you’ve sent and who joined"
                    >
                      <Text style={styles.seeInvitesText}>See your invites</Text>
                      <CountBadge count={myInviteCount ?? 0} />
                    </Pressable>
                  ) : null}
                  {gate === 'closed' && !offline && contactsFinder ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.seeInvites,
                        pressed && { opacity: ALPHA.a70 },
                      ]}
                      onPress={() => setFindMatesOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Find mates in your contacts"
                      accessibilityHint="Shows who from your contacts is on Mahi, and lets you invite the rest"
                    >
                      <Text style={styles.seeInvitesText}>Find mates in your contacts</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Reanimated.View>
              {pullOn ? (
                <Reanimated.View
                  style={[StyleSheet.absoluteFill, pull.cameraStyle]}
                  pointerEvents="none"
                >
                  <PullHandle top={openTagsTop(safeTop, fontScale)} anchorRef={pullTip} />
                </Reanimated.View>
              ) : null}
            </View>
          </GestureDetector>
        ) : null}

        {gate === 'loading' && !offline ? (
          <View
            style={styles.gateLoading}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Checking your tags"
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={COLORS.accent} />
            <Text style={styles.gateLoadingText}>Checking your tags…</Text>
          </View>
        ) : null}

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
                <View
                  style={styles.lensToggle}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Lens"
                >
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel="Normal lens, 1×"
                    accessibilityState={{ checked: !useUltraWide, disabled: isCapturing }}
                    hitSlop={SLOP_LENS}
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
                    accessibilityRole="radio"
                    accessibilityLabel="Wide lens, 0.5×"
                    accessibilityState={{ checked: useUltraWide, disabled: isCapturing }}
                    hitSlop={SLOP_LENS}
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
                <View
                  style={styles.lensToggle}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Photo or video"
                >
                  {(['photo', 'video'] as const).map((m) => (
                    <Pressable
                      key={m}
                      style={({ pressed }) => [
                        styles.lensOption,
                        shotMode === m && styles.lensOptionActive,
                        pressed && { opacity: ALPHA.a80 },
                      ]}
                      disabled={switchDisabled}
                      hitSlop={SLOP_LENS}
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

        {!blocked ? (
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

            <View ref={shutterTip} style={styles.shutterSlot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={shutterLabel({
                  videoOn,
                  mode: shotMode,
                  recording,
                  second: captureState === 'awaiting-second',
                })}
                accessibilityValue={captureStep ? { text: captureStep } : undefined}
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
                {recording ? (
                  <View style={styles.shutterRecording} />
                ) : (
                  <View
                    style={[
                      styles.shutterInner,
                      {
                        backgroundColor:
                          videoOn && shotMode === 'video' ? COLORS.danger : shutterFill,
                      },
                    ]}
                  />
                )}
              </Pressable>
              {captureStep ? (
                <Text style={styles.captureStep} maxFontSizeMultiplier={LAYOUT.largeTextScale}>
                  {captureStep}
                </Text>
              ) : null}
            </View>

            {/* Flash — photos only, so it steps aside while the switch says Video. */}
            {videoOn && shotMode === 'video' ? (
              <View style={styles.flipButton} />
            ) : (
              <FlashButton choice={flashChoice} onPress={cycleFlash} disabled={switchDisabled} />
            )}
          </View>
        ) : null}

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
          requiredTags={postRequiredTags}
          answering={answersATag(openTags, serverOffsetMs) ? openTags.map((t) => t.username) : []}
          locationEnabled={locationEnabled}
          onToggleLocation={handleToggleLocation}
        />

        <InviteShareSheet
          invites={postInvites}
          onSend={sendInvite}
          onClose={() => setPostInvites([])}
        />

        <MyInvitesSheet visible={invitesOpen} onClose={() => setInvitesOpen(false)} dark={dark} />
        <FindMatesSheet
          visible={findMatesOpen}
          onClose={() => setFindMatesOpen(false)}
          dark={dark}
        />

        <PointFlight
          flight={flight}
          onLanded={() => {
            setHeldPoints(null);
            hapticSequence(flight?.milestone ? ['pointsUp', 'milestone'] : ['pointsUp']);
          }}
          onDone={() => {
            setFlight(null);
            const waiting = invitesAfterCelebration.current;
            invitesAfterCelebration.current = [];
            if (waiting.length > 0) setPostInvites(waiting);
          }}
        />

        <PointCelebration
          content={celebration}
          onClose={() => {
            setCelebration(null);
            const waiting = invitesAfterCelebration.current;
            invitesAfterCelebration.current = [];
            // iOS shows one sheet at a time: let the celebration finish closing first.
            if (waiting.length > 0) setTimeout(() => setPostInvites(waiting), DURATION.d300);
          }}
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
  pointsSpot: {
    position: 'absolute',
    right: OFFSET.o24,
  },
  pointsCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
    minHeight: SIZE.z36,
    paddingHorizontal: SPACE.s12,
    paddingVertical: SPACE.s8,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: withAlpha(COLORS.accent, ALPHA.a50),
    backgroundColor: withAlpha(COLORS.black, ALPHA.a35),
  },
  pointsNumber: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l24,
  },
  pointsLabel: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    opacity: ALPHA.a75,
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
  shutterHint: {
    textAlign: 'center',
    paddingHorizontal: SPACE.s32,
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
    width: '100%',
    maxWidth: SIZE.z360,
    alignItems: 'center',
    gap: SPACE.s12,
    paddingVertical: SPACE.s24,
    paddingHorizontal: SPACE.s24,
    borderRadius: RADIUS.r24,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: withAlpha(COLORS.accent, ALPHA.a50),
    backgroundColor: withAlpha(COLORS.black, ALPHA.a35),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: SIZE.z4 },
    shadowOpacity: ALPHA.a25,
    shadowRadius: SHADOW_BLUR.b12,
    elevation: ELEVATION.e8,
  },
  noTagsWords: {
    alignItems: 'center',
    gap: SPACE.s12,
  },
  // The app's one main-button style (ListState's): accent pill, dark words.
  seeFeedButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s24,
    minHeight: SIZE.z44,
    justifyContent: 'center',
    marginTop: SPACE.s8,
  },
  seeFeedText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  // The second choice on the no-tag card: the same pill, outlined in the accent.
  inviteMateButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    borderWidth: BORDER_WIDTH.w1_5,
    borderColor: COLORS.accent,
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s24,
    minHeight: SIZE.z44,
  },
  inviteMateText: {
    color: COLORS.accent,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  // A quiet text link under the card's buttons, with a full-size tap area.
  seeInvites: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
    justifyContent: 'center',
    minHeight: SIZE.z44,
    paddingHorizontal: SPACE.s12,
  },
  seeInvitesText: {
    color: withAlpha(COLORS.offWhite, ALPHA.a80),
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
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
  waitingPoints: {
    color: COLORS.accent,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
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
  shutterSlot: {
    width: SIZE.z130,
    height: SIZE.z72,
    alignItems: 'center',
  },
  captureStep: {
    position: 'absolute',
    top: '100%',
    left: -SIZE.z24,
    right: -SIZE.z24,
    marginTop: SPACE.s4,
    color: COLORS.white,
    fontSize: FONT_SIZE.f12,
    lineHeight: LINE_HEIGHT.l16,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    textShadowColor: withAlpha(COLORS.black, ALPHA.a72),
    textShadowOffset: { width: 0, height: SIZE.z1 },
    textShadowRadius: SHADOW_BLUR.b3,
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
    minHeight: SIZE.z30,
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
    // Room for the longest label ("Tag 2 more friends to post") on a small phone.
    paddingHorizontal: SPACE.s32,
  },
  postButtonText: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.f17,
    fontFamily: FONTS.semiBold,
  },
  captionPill: {
    minHeight: SIZE.z36,
    paddingVertical: SPACE.s8,
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
  /** The mate circles at the top of the tag sheet. */
  tagCircles: {
    paddingVertical: SPACE.s8,
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
  /** The −/+ tap area: 44 square, transparent; the 32 circle sits inside it. */
  inviteStepTarget: {
    width: SIZE.z44,
    height: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
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
  // "Need an idea?" under the caption: a text link, 44 pt tall to tap.
  ideaLink: {
    alignSelf: 'flex-start',
    minHeight: SIZE.z44,
    justifyContent: 'center',
  },
  ideaLinkText: {
    color: COLORS.accent,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
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
    minHeight: SIZE.z44,
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
    paddingHorizontal: SPACE.s24,
  },
  permissionCard: {
    width: '100%',
    maxWidth: SIZE.z400,
    alignItems: 'center',
    paddingHorizontal: SPACE.s24,
    paddingVertical: SPACE.s32,
    borderRadius: RADIUS.r24,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: withAlpha(COLORS.offWhite, ALPHA.a15),
    backgroundColor: COLORS.surfaceDark2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: SIZE.z4 },
    shadowOpacity: ALPHA.a25,
    shadowRadius: SHADOW_BLUR.b12,
    elevation: ELEVATION.e8,
  },
  permissionIcon: {
    width: SIZE.z64,
    height: SIZE.z64,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER_WIDTH.w1,
    borderColor: withAlpha(COLORS.accent, ALPHA.a50),
    backgroundColor: withAlpha(COLORS.accent, ALPHA.a12),
    marginBottom: SPACE.s20,
  },
  permissionCopy: {
    alignItems: 'center',
  },
  permissionEyebrow: {
    color: COLORS.accent,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACE.s4,
  },
  permissionTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f24,
    lineHeight: LINE_HEIGHT.l28,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    marginBottom: SPACE.s8,
  },
  deniedMessage: {
    color: withAlpha(COLORS.offWhite, ALPHA.a80),
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l22,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  permissionButton: {
    width: '100%',
    minHeight: SIZE.z52,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s14,
    paddingHorizontal: SPACE.s24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.s24,
  },
  permissionButtonText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
  },
  permissionNote: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f12,
    lineHeight: LINE_HEIGHT.l18,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginTop: SPACE.s16,
  },
  gateLoading: {
    position: 'absolute',
    left: SPACE.s32,
    right: SPACE.s32,
    top: '50%',
    minHeight: SIZE.z56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s12,
    borderRadius: RADIUS.r20,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: withAlpha(COLORS.offWhite, ALPHA.a15),
    backgroundColor: withAlpha(COLORS.black, ALPHA.a55),
  },
  gateLoadingText: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f14,
    lineHeight: LINE_HEIGHT.l20,
    fontFamily: FONTS.semiBold,
  },
});
