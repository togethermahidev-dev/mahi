import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import CaptionText from '@/components/CaptionText';
import type { Database } from '@/types';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS } from '@/constants/tokens';

type PostRow = Database['public']['Tables']['posts']['Row'];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const APP_HEADER_H = Platform.OS === 'ios' ? 108 : 80;
const PIP_W = 90;
const PIP_H = 120;

interface PostDetailModalProps {
  post: PostRow;
  onClose: () => void;
}

export default function PostDetailModal({
  post,
  onClose,
}: PostDetailModalProps): React.JSX.Element {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, []);

  const handleClose = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() =>
      onClose()
    );
  };

  // ── Dual-camera PiP ──────────────────────────────────────────────────────
  const hasDual = !!post.pov_image_url;
  const [rearIsPrimary, setRearIsPrimary] = useState(true);
  const primaryUrl = hasDual && !rearIsPrimary ? post.pov_image_url! : post.image_url;
  const pipUrl = hasDual && !rearIsPrimary ? post.image_url : post.pov_image_url;

  // ── Draggable PiP (same safe-zone logic as FeedScreen) ────────────────
  const BOTTOM_CONTENT_H = 200;
  const PIP_SAFE_TOP = APP_HEADER_H + 60;
  const PIP_SAFE_BOTTOM = SCREEN_H - BOTTOM_CONTENT_H - PIP_H;
  const PIP_SAFE_LEFT = 8;
  const PIP_SAFE_RIGHT = SCREEN_W - PIP_W - 70;

  const initialPipX = PIP_SAFE_LEFT;
  const initialPipY = PIP_SAFE_BOTTOM;
  const pipTransX = useSharedValue(initialPipX);
  const pipTransY = useSharedValue(initialPipY);
  const pipStartX = useSharedValue(initialPipX);
  const pipStartY = useSharedValue(initialPipY);
  const pipScaleVal = useSharedValue(1);

  const pipPanGesture = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart(() => {
      'worklet';
      pipStartX.value = pipTransX.value;
      pipStartY.value = pipTransY.value;
      pipScaleVal.value = withSpring(1.1, { damping: 12, stiffness: 200 });
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    })
    .onUpdate((e) => {
      'worklet';
      const rawX = pipStartX.value + e.translationX;
      const rawY = pipStartY.value + e.translationY;
      pipTransX.value = Math.max(PIP_SAFE_LEFT, Math.min(rawX, PIP_SAFE_RIGHT));
      pipTransY.value = Math.max(PIP_SAFE_TOP, Math.min(rawY, PIP_SAFE_BOTTOM));
    })
    .onEnd(() => {
      'worklet';
      const midX = (PIP_SAFE_LEFT + PIP_SAFE_RIGHT) / 2;
      const midY = (PIP_SAFE_TOP + PIP_SAFE_BOTTOM) / 2;
      const snapX = pipTransX.value < midX ? PIP_SAFE_LEFT : PIP_SAFE_RIGHT;
      const snapY = pipTransY.value < midY ? PIP_SAFE_TOP : PIP_SAFE_BOTTOM;
      pipTransX.value = withSpring(snapX, { damping: 16, stiffness: 140, overshootClamping: true });
      pipTransY.value = withSpring(snapY, { damping: 16, stiffness: 140, overshootClamping: true });
      pipScaleVal.value = withSpring(1, { damping: 12, stiffness: 200 });
    });

  const pipAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: pipTransX.value },
      { translateY: pipTransY.value },
      { scale: pipScaleVal.value },
    ],
  }));

  const pipTapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => setRearIsPrimary((p) => !p));

  const pipGesture = Gesture.Race(pipPanGesture, pipTapGesture);

  // ── Date string ───────────────────────────────────────────────────────────
  const dateStr = new Date(post.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
      {/* Fullscreen image */}
      <Image
        source={{ uri: primaryUrl ?? undefined }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />

      {/* Top gradient — close button + streak badge */}
      <LinearGradient colors={[withAlpha(COLORS.black, 0.6), 'transparent']} style={styles.topOverlay}>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.closeX}>✕</Text>
        </TouchableOpacity>
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>DAY {post.streak_day}</Text>
        </View>
      </LinearGradient>

      {/* Bottom gradient — caption + date */}
      <LinearGradient
        colors={['transparent', withAlpha(COLORS.black, 0.7)]}
        style={styles.bottomOverlay}
        pointerEvents="box-none"
      >
        {post.caption ? (
          <CaptionText
            caption={post.caption}
            tagged={[]}
            style={styles.captionText}
            numberOfLines={4}
          />
        ) : null}
        <Text style={styles.dateText}>{dateStr}</Text>
      </LinearGradient>

      {/* Draggable PiP */}
      {hasDual && pipUrl && (
        <GestureDetector gesture={pipGesture}>
          <Reanimated.View style={[styles.pip, pipAnimStyle]}>
            <Image
              source={{ uri: pipUrl }}
              style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.r10 }]}
              resizeMode="cover"
            />
          </Reanimated.View>
        </GestureDetector>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 520,
    backgroundColor: COLORS.black,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s16,
    paddingTop: Platform.OS === 'ios' ? SPACE.s60 : SPACE.s32,
    paddingBottom: SPACE.s32,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.r18,
    backgroundColor: withAlpha(COLORS.black, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
    lineHeight: 18,
    color: COLORS.white,
  },
  streakBadge: {
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s6,
    borderRadius: RADIUS.r50,
    backgroundColor: withAlpha(COLORS.white, 0.2),
  },
  streakText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    letterSpacing: 2,
    color: COLORS.white,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s50,
    paddingBottom: SPACE.s50,
    gap: SPACE.s8,
  },
  captionText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.italic,
    color: COLORS.white,
    textShadowColor: withAlpha(COLORS.black, 0.5),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dateText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.italic,
    letterSpacing: 1,
    color: withAlpha(COLORS.white, 0.6),
  },
  pip: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PIP_W,
    height: PIP_H,
    borderRadius: RADIUS.r10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: withAlpha(COLORS.white, 0.6),
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
});
