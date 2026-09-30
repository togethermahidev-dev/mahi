import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Animated,
  TouchableOpacity,
  useWindowDimensions,
  Dimensions,
  TextInput,
  Keyboard,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeed } from '@/hooks/useFeed';
import { useFeedStore, useSocialStore, useUserStore, useAuthStore } from '@/store';
import { LikeIcon, HeartIcon, CommentIcon } from '@/components/ScreenIcons';
import UserProfileScreen from '@/screens/UserProfileScreen';
import TaggedBubbleStack from '@/components/TaggedBubbleStack';
import CaptionText from '@/components/CaptionText';
import { formatWait } from '@/lib/countdown';
import PointsBadge from '@/components/PointsBadge';
import KeyboardInset from '@/components/KeyboardInset';
import type { FeedPost } from '@/api';
import type { CommentWithProfile } from '@/api/social';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS } from '@/constants/tokens';

// AppHeader: paddingTop (60 ios / 32 android) + inner row (~36px) + paddingBottom (12)
const APP_HEADER_H = Platform.OS === 'ios' ? 108 : 80;

// TikTok-style snap: each card fills the full screen height
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_HEIGHT = SCREEN_HEIGHT;

// Pip dimensions for the feed card
const FEED_PIP_W = 90;
const FEED_PIP_H = 120;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1_000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── CommentRow ──────────────────────────────────────────────────────────────

function CommentRow({ comment, dark }: { comment: CommentWithProfile; dark: boolean }) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const name = comment.profiles.display_name ?? comment.profiles.username;
  const initials = (comment.profiles.username ?? '?')[0].toUpperCase();

  return (
    <View style={styles.commentRow}>
      {comment.profiles.avatar_url ? (
        <Image source={{ uri: comment.profiles.avatar_url }} style={styles.commentAvatar} />
      ) : (
        <View style={[styles.commentAvatar, styles.avatarFallback, { backgroundColor: muted }]}>
          <Text style={[styles.commentAvatarInitial, { color: text }]}>{initials}</Text>
        </View>
      )}
      <View style={styles.commentBody}>
        <Text style={[styles.commentUsername, { color: text }]}>{name}</Text>
        <Text style={[styles.commentText, { color: text }]}>{comment.content}</Text>
      </View>
      <Text style={[styles.commentTime, { color: muted }]}>{relativeTime(comment.created_at)}</Text>
    </View>
  );
}

// ─── LockedPostItem ──────────────────────────────────────────────────────────

/** A friend's post while the viewer hasn't posted: who and when, no photo or caption. */
function LockedPostItem({
  item,
  onAvatarPress,
  onUnlockPress,
}: {
  item: FeedPost;
  onAvatarPress: (userId: string) => void;
  onUnlockPress: () => void;
}) {
  const { colors } = useAppTheme();
  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();
  return (
    <View style={[styles.lockedCard, { backgroundColor: colors.offBlack }]}>
      <TouchableOpacity
        style={styles.lockedWho}
        onPress={() => onAvatarPress(item.profiles.id)}
        activeOpacity={0.75}
      >
        {item.profiles.avatar_url ? (
          <Image source={{ uri: item.profiles.avatar_url }} style={styles.lockedAvatar} />
        ) : (
          <View
            style={[styles.lockedAvatar, styles.avatarFallback, { borderColor: colors.accent }]}
          >
            <Text style={[styles.avatarInitial, { color: colors.offWhite }]}>{initials}</Text>
          </View>
        )}
        <Text style={[styles.lockedName, { color: colors.offWhite }]}>{name}</Text>
        <Text style={[styles.lockedTime, { color: colors.offWhite }]}>
          posted {relativeTime(item.created_at)} · DAY {item.streak_day}
        </Text>
      </TouchableOpacity>
      <Text style={[styles.lockedHint, { color: colors.offWhite }]}>
        Post your workout to see it
      </Text>
      <TouchableOpacity
        style={[styles.lockedButton, { backgroundColor: colors.accent }]}
        onPress={onUnlockPress}
        activeOpacity={0.85}
      >
        <Text style={[styles.lockedButtonText, { color: colors.offBlack }]}>POST TO UNLOCK</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── PostItem ────────────────────────────────────────────────────────────────

function PostItem({
  item,
  dark,
  width,
  onAvatarPress,
  onCommentPress,
}: {
  item: FeedPost;
  dark: boolean;
  width: number;
  onAvatarPress: (userId: string) => void;
  onCommentPress: (postId: string) => void;
}) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.1) : withAlpha(COLORS.offBlack, 0.1);
  const cardBg = dark ? COLORS.surfaceDark2 : COLORS.surfaceLight;

  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();

  const [rearIsPrimary, setRearIsPrimary] = useState(true);
  // Whether the primary photo is landscape (wider than tall), detected on load,
  // so a landscape post is letterboxed (contain) rather than center-cropped.
  const [primaryLandscape, setPrimaryLandscape] = useState(false);

  // ── Store selectors ──────────────────────────────────────────────────────
  const currentUser = useUserStore((s) => s.profile);
  const likedByMe = useSocialStore((s) => s.likedByMe[item.id] ?? item.liked_by_me);
  const likeCount = useFeedStore((s) => {
    const p = s.posts.find((p) => p.id === item.id);
    return p?.like_count ?? item.like_count;
  });
  const commentCount = useFeedStore((s) => {
    const p = s.posts.find((p) => p.id === item.id);
    return p?.comment_count ?? item.comment_count;
  });

  // Seed social store on first render
  useEffect(() => {
    useSocialStore.getState().initPost(item.id, item.liked_by_me);
  }, [item.id, item.liked_by_me]);

  // ── Dual-camera pip ──────────────────────────────────────────────────────
  const hasDual = !!item.pov_image_url;
  const primaryUrl = hasDual && !rearIsPrimary ? item.pov_image_url! : item.image_url;
  const pipUrl = hasDual && !rearIsPrimary ? item.image_url : item.pov_image_url;

  // ── Draggable PIP (FaceTime-style) ──────────────────────────────────────
  const containerH = CARD_HEIGHT;

  // Safe zone: keep PiP clear of all overlay UI elements.
  // These values define where the PiP's TOP-LEFT corner can be placed.
  //
  // Top:    app header (108) + tagged pills (~3×32 + gaps) + buffer
  // Bottom: from the bottom up — paddingBottom(80) + avatar(42) + gap(10)
  //         + caption(~40) + buffer(16) = ~188px of content, so PiP top
  //         must be at most containerH - 188 - FEED_PIP_H
  // Right:  side action column sits at right:12, icons ~44px wide + padding
  // Left:   small margin
  const BOTTOM_CONTENT_H = 200; // avatar + caption + paddingBottom + buffer
  const PIP_SAFE_TOP = APP_HEADER_H + 120;
  const PIP_SAFE_BOTTOM = containerH - BOTTOM_CONTENT_H - FEED_PIP_H;
  const PIP_SAFE_LEFT = 8;
  const PIP_SAFE_RIGHT = width - FEED_PIP_W - 70;

  const initialPipX = PIP_SAFE_LEFT;
  const initialPipY = PIP_SAFE_BOTTOM;
  const pipTransX = useSharedValue(initialPipX);
  const pipTransY = useSharedValue(initialPipY);
  const pipStartX = useSharedValue(initialPipX);
  const pipStartY = useSharedValue(initialPipY);
  const pipScaleVal = useSharedValue(1);

  // Reset PIP position when FlashList recycles this cell for a different post
  useEffect(() => {
    pipTransX.value = initialPipX;
    pipTransY.value = initialPipY;
    pipStartX.value = initialPipX;
    pipStartY.value = initialPipY;
    pipScaleVal.value = 1;
  }, [item.id]);

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
      // Snap to nearest corner within the safe zone
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
    .onEnd(() => {
      console.log('[FeedScreen] PIP swap post', item.id);
      setRearIsPrimary((p) => !p);
    });

  const pipGesture = Gesture.Race(pipPanGesture, pipTapGesture);

  // ── Double-tap medal burst animation ─────────────────────────────────────
  const medalScale = useRef(new Animated.Value(0)).current;
  const medalOpacity = useRef(new Animated.Value(0)).current;
  const [medalPos, setMedalPos] = useState({ x: 0, y: 0 });
  const [showMedal, setShowMedal] = useState(false);

  const triggerMedalBurst = useCallback(
    (x: number, y: number) => {
      setMedalPos({ x, y });
      setShowMedal(true);
      medalScale.setValue(0);
      medalOpacity.setValue(1);

      Animated.sequence([
        Animated.spring(medalScale, {
          toValue: 1.3,
          useNativeDriver: true,
          speed: 30,
          bounciness: 8,
        }),
        Animated.timing(medalScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.delay(300),
        Animated.timing(medalOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setShowMedal(false));
    },
    [medalScale, medalOpacity]
  );

  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      console.log(
        '[FeedScreen] double-tap post',
        item.id,
        '| likedByMe:',
        likedByMe,
        '| user:',
        currentUser?.id
      );
      if (!currentUser) {
        console.warn('[FeedScreen] double-tap: no currentUser');
        return;
      }
      if (!likedByMe) {
        console.log('[FeedScreen] double-tap → toggleLike (like)');
        useSocialStore.getState().toggleLike(item.id, currentUser.id);
      } else {
        console.log('[FeedScreen] double-tap → already liked, skipping');
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      triggerMedalBurst(x, y);
    },
    [currentUser, likedByMe, item.id, triggerMedalBurst]
  );

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd((e) => {
      handleDoubleTap(e.x, e.y);
    });

  // ── Like handler (action bar tap) ───────────────────────────────────────
  const handleLike = useCallback(() => {
    console.log(
      '[FeedScreen] like button tap post',
      item.id,
      '| likedByMe:',
      likedByMe,
      '| user:',
      currentUser?.id
    );
    if (!currentUser) {
      console.warn('[FeedScreen] like: no currentUser');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useSocialStore.getState().toggleLike(item.id, currentUser.id);
  }, [item.id, currentUser, likedByMe]);

  // ── Comment handler ──────────────────────────────────────────────────────
  const handleCommentPress = useCallback(() => {
    onCommentPress(item.id);
  }, [item.id, onCommentPress]);

  return (
    <View style={[styles.card, { backgroundColor: cardBg, height: CARD_HEIGHT }]}>
      {/* Post image — double-tap to like */}
      <View style={[styles.imageContainer, { width, flex: 1 }]}>
        <GestureDetector gesture={doubleTap}>
          <View style={[{ width, flex: 1 }, primaryLandscape && styles.letterbox]}>
            <Image
              source={{ uri: primaryUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode={primaryLandscape ? 'contain' : 'cover'}
              onLoad={(e) => {
                const src = e.nativeEvent?.source;
                // Landscape (wider than tall) → letterbox; portrait/square stay cover.
                if (src?.width && src?.height) {
                  setPrimaryLandscape(src.width / src.height > 1.05);
                }
              }}
            />
            {/* Top gradient — tagged pills + streak badge inline */}
            <LinearGradient
              colors={[withAlpha(COLORS.black, 0.6), 'transparent']}
              style={styles.postOverlay}
              pointerEvents="box-none"
            >
              <TaggedBubbleStack
                users={item.tagged_users}
                onPressUser={(u) => onAvatarPress(u.user_id)}
                style={styles.topTaggedPills}
              />
              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>DAY {item.streak_day}</Text>
                {item.response ? (
                  <Text style={styles.responseText}>
                    ANSWERED @{item.response.tagger_username} IN{' '}
                    {formatWait(item.response.seconds).toUpperCase()}
                  </Text>
                ) : null}
              </View>
            </LinearGradient>
            {/* Bottom gradient — profile row + caption */}
            <LinearGradient
              colors={['transparent', withAlpha(COLORS.black, 0.7)]}
              style={styles.captionOverlay}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                style={styles.avatarRow}
                onPress={() => onAvatarPress(item.profiles.id)}
                activeOpacity={0.75}
              >
                {item.profiles.avatar_url ? (
                  <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatar} />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      styles.avatarFallback,
                      { backgroundColor: withAlpha(COLORS.white, 0.3) },
                    ]}
                  >
                    <Text style={styles.avatarInitial}>{initials}</Text>
                  </View>
                )}
                <View style={styles.userInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.usernameOverlay}>{name}</Text>
                    <PointsBadge points={item.profiles.points} style={styles.pointsOverlay} />
                  </View>
                  <Text style={styles.timeOverlay}>{relativeTime(item.created_at)}</Text>
                </View>
              </TouchableOpacity>
              {item.caption ? (
                <CaptionText
                  caption={item.caption}
                  tagged={item.tagged_users}
                  style={styles.captionText}
                  onPressUser={(u) => onAvatarPress(u.user_id)}
                  numberOfLines={2}
                />
              ) : null}
            </LinearGradient>
            {/* Heart burst overlay — shown on double-tap */}
            {showMedal && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.medalBurst,
                  {
                    left: medalPos.x - 40,
                    top: medalPos.y - 40,
                    transform: [{ scale: medalScale }],
                    opacity: medalOpacity,
                  },
                ]}
              >
                <HeartIcon size={80} color={COLORS.white} filled />
              </Animated.View>
            )}
          </View>
        </GestureDetector>
        {/* (Tagged pills moved to top gradient row) */}
        {/* Draggable PIP — uses RNGH so it wins over scroll/navigation gestures */}
        {hasDual && pipUrl && (
          <GestureDetector gesture={pipGesture}>
            <Reanimated.View style={[styles.feedPip, pipAnimStyle]}>
              <Image
                source={{ uri: pipUrl }}
                style={[StyleSheet.absoluteFill, { borderRadius: RADIUS.r10 }]}
                resizeMode="cover"
              />
            </Reanimated.View>
          </GestureDetector>
        )}

        {/* ── Right-side action column (Reels / TikTok style) ── */}
        {/* Icon SIZE is decoupled from HIT TARGET: glyphs stay small (~32px)
            while each button is a ≥48×48 tappable area + generous hitSlop so
            near-miss taps still register. Column raised (bottom:140) so the
            buttons sit higher and clear of the caption row.
            hitSlop is asymmetric (left:4) on purpose: the left edge faces the
            draggable PiP's bottom-right snap zone, so we don't extend the hit
            area that way — it grows up/down/right instead. */}
        <View style={styles.sideActions} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.sideActionBtn}
            onPress={handleLike}
            activeOpacity={0.7}
            hitSlop={{ top: 20, bottom: 20, left: 4, right: 20 }}
          >
            <HeartIcon size={32} color={COLORS.white} filled={likedByMe} />
            <Text style={styles.sideActionCount}>{likeCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sideActionBtn}
            onPress={handleCommentPress}
            activeOpacity={0.7}
            hitSlop={{ top: 20, bottom: 20, left: 4, right: 20 }}
          >
            <CommentIcon size={32} color={COLORS.white} />
            <Text style={styles.sideActionCount}>{commentCount}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── CommentSheet (bottom-sheet overlay) ────────────────────────────────────

const SHEET_HEIGHT = SCREEN_HEIGHT * 0.6;

function CommentSheet({
  postId,
  dark,
  onClose,
}: {
  postId: string;
  dark: boolean;
  onClose: () => void;
}) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.1) : withAlpha(COLORS.offBlack, 0.1);
  const sheetBg = dark ? COLORS.surfaceDark2 : COLORS.surfaceLight;

  const [commentText, setCommentText] = useState('');
  const currentUser = useUserStore((s) => s.profile);
  const comments = useSocialStore((s) => s.comments[postId]);
  const commentCount = useFeedStore((s) => {
    const p = s.posts.find((p) => p.id === postId);
    return p?.comment_count ?? 0;
  });

  // Slide-up animation
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  useEffect(() => {
    useSocialStore.getState().loadComments(postId);
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 22,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [postId]);

  const dismiss = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SHEET_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [onClose, slideAnim]);

  const handleSubmitComment = useCallback(() => {
    const trimmed = commentText.trim();
    if (!trimmed || !currentUser) return;
    useSocialStore.getState().addComment(postId, currentUser.id, trimmed, {
      id: currentUser.id,
      username: currentUser.username,
      display_name: currentUser.display_name ?? null,
      avatar_url: currentUser.avatar_url ?? null,
    });
    setCommentText('');
    Keyboard.dismiss();
  }, [commentText, postId, currentUser]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={dismiss} />
      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            height: SHEET_HEIGHT,
            backgroundColor: sheetBg,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Handle */}
        <View style={styles.sheetHandle}>
          <View style={[styles.sheetHandleBar, { backgroundColor: muted }]} />
          <Text style={[styles.sheetTitle, { color: text }]}>
            {commentCount} {commentCount === 1 ? 'COMMENT' : 'COMMENTS'}
          </Text>
        </View>

        {/* Comment list */}
        <View style={{ flex: 1 }}>
          {comments && comments.length > 0 ? (
            <FlashList
              data={comments}
              keyExtractor={(c) => c.id}
              renderItem={({ item: comment }) => <CommentRow comment={comment} dark={dark} />}
            />
          ) : (
            <View style={styles.sheetEmpty}>
              <Text style={[styles.sheetEmptyText, { color: muted }]}>No comments yet</Text>
            </View>
          )}
        </View>

        {/* Comment input — KeyboardInset below keeps it just above the keyboard */}
        <View style={[styles.commentInputRow, { borderTopColor: border }]}>
          <TextInput
            style={[styles.commentInput, { color: text, borderColor: border }]}
            placeholder="Add a comment…"
            placeholderTextColor={muted}
            value={commentText}
            onChangeText={setCommentText}
            returnKeyType="send"
            onSubmitEditing={handleSubmitComment}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.commentSubmit, { backgroundColor: COLORS.accent }]}
            onPress={handleSubmitComment}
            activeOpacity={0.75}
          >
            <Text style={styles.commentSubmitText}>SEND</Text>
          </TouchableOpacity>
        </View>
        <KeyboardInset />
      </Animated.View>
    </View>
  );
}

// ─── FeedScreen ──────────────────────────────────────────────────────────────

interface FeedScreenProps {
  /** Take the user to the camera (used by locked posts). */
  onGoToCamera?: () => void;
  onScrollTopChange?: (atTop: boolean) => void;
  headerAnim?: Animated.Value;
  onOverlayChange?: (active: boolean) => void;
}

export default function FeedScreen({
  onGoToCamera,
  onScrollTopChange,
  headerAnim,
  onOverlayChange,
}: FeedScreenProps = {}): React.JSX.Element {
  const { dark } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);

  const { posts, isLoading, error, hasMore, loadMore, refresh } = useFeed();

  // Profile overlay, conversation overlay, and comment sheet — lifted to
  // FeedScreen so overlays cover the full screen (not just the PostItem card)
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Notify parent when a fullscreen overlay (profile) opens/closes
  const feedOverlay = !!profileUserId;
  const prevFeedOverlay = useRef(false);
  if (feedOverlay !== prevFeedOverlay.current) {
    prevFeedOverlay.current = feedOverlay;
    onOverlayChange?.(feedOverlay);
  }

  const handleAvatarPress = useCallback(
    (userId: string) => {
      // Don't open overlay for own profile
      if (userId === currentUserId) return;
      setProfileUserId(userId);
    },
    [currentUserId]
  );

  // ── Realtime subscriptions — managed at screen level via viewable items ──
  const visiblePostIds = useRef(new Set<string>());

  const handleViewableChange = useCallback(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      const { subscribeToPost, unsubscribeFromPost } = useSocialStore.getState();
      const nowVisible = new Set(viewableItems.map((v) => v.key));

      // Subscribe to newly visible
      nowVisible.forEach((id) => {
        if (!visiblePostIds.current.has(id)) subscribeToPost(id);
      });
      // Unsubscribe from departed
      visiblePostIds.current.forEach((id) => {
        if (!nowVisible.has(id)) unsubscribeFromPost(id);
      });

      visiblePostIds.current = nowVisible;
    },
    []
  );

  // ── Scroll-driven header hide/show ───────────────────────────────────────
  const localHeaderAnim = useRef(new Animated.Value(0)).current;
  const headerOffset = headerAnim ?? localHeaderAnim;

  const atTopRef = useRef(true);

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;

    const isAtTop = y <= 2;
    if (isAtTop !== atTopRef.current) {
      atTopRef.current = isAtTop;
      onScrollTopChange?.(isAtTop);
    }

    // Show header on first card, hide on all others
    const target = isAtTop ? 0 : APP_HEADER_H;
    Animated.timing(headerOffset, {
      toValue: target,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <FlashList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) =>
          item.locked ? (
            <LockedPostItem
              item={item}
              onAvatarPress={handleAvatarPress}
              onUnlockPress={() => onGoToCamera?.()}
            />
          ) : (
            <PostItem
              item={item}
              dark={dark}
              width={screenWidth}
              onAvatarPress={handleAvatarPress}
              onCommentPress={setCommentPostId}
            />
          )
        }
        getItemType={(item) => (item.locked ? 'locked' : 'post')}
        snapToInterval={CARD_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={handleViewableChange}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && posts.length === 0}
            onRefresh={refresh}
            tintColor={text}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: text }]}>NO POSTS YET</Text>
              <Text style={[styles.emptySub, { color: muted }]}>
                Take your first streak photo to appear here
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          error ? (
            <Text style={[styles.errorText, { color: muted }]}>Failed to load feed</Text>
          ) : null
        }
      />

      {/* Full-screen profile — shown when another user's avatar is tapped */}
      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}

      {/* Comment sheet — opened when comment button is tapped */}
      {commentPostId ? (
        <CommentSheet postId={commentPostId} dark={dark} onClose={() => setCommentPostId(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  card: {
    borderRadius: 0,
    overflow: 'hidden',
  },
  postOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s12,
    paddingTop: APP_HEADER_H + SPACE.s4,
    paddingBottom: SPACE.s32,
  },
  topTaggedPills: {
    position: 'relative',
    left: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: SPACE.s6,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.r21,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
  userInfo: {
    gap: SPACE.s2,
  },
  usernameOverlay: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1.5,
    color: COLORS.white,
  },
  timeOverlay: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.italic,
    color: withAlpha(COLORS.white, 0.75),
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
  responseText: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1,
    color: COLORS.white,
    marginTop: SPACE.s2,
  },
  imageContainer: {
    position: 'relative',
  },
  // Black bars behind a letterboxed (contain) landscape photo — standard
  // photo-letterbox color, not a theme surface.
  letterbox: {
    backgroundColor: COLORS.black,
  },
  feedPip: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: FEED_PIP_W,
    height: FEED_PIP_H,
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
  medalBurst: {
    position: 'absolute',
    width: 80,
    height: 80,
  },
  // ── Caption overlay (on image)
  captionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 70,
    paddingHorizontal: SPACE.s14,
    paddingTop: SPACE.s50,
    paddingBottom: SPACE.s80,
    gap: SPACE.s10,
  },
  captionText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.italic,
    color: COLORS.white,
    textShadowColor: withAlpha(COLORS.black, 0.5),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // ── Right-side action column (Reels / TikTok style)
  sideActions: {
    position: 'absolute',
    right: 12,
    bottom: 140,
    alignItems: 'center',
    gap: SPACE.s20,
  },
  sideActionBtn: {
    // Hit target ≥48×48 (icon glyph stays ~32px, centered) so taps that
    // land just outside the glyph still register. hitSlop adds up to 20px more
    // on top/bottom/right (left kept tight to avoid the PiP snap zone).
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s4,
  },
  sideActionCount: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
    textShadowColor: withAlpha(COLORS.black, 0.6),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // ── Comment rows (shared by CommentSheet)
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACE.s12,
    paddingVertical: SPACE.s8,
    gap: SPACE.s8,
  },
  commentAvatar: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.r13,
  },
  commentAvatarInitial: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.bold,
  },
  commentBody: {
    flex: 1,
    gap: SPACE.s2,
  },
  commentUsername: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1,
  },
  commentText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
  commentTime: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.italic,
    paddingTop: SPACE.s2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s12,
    paddingVertical: SPACE.s10,
    gap: SPACE.s8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1,
    height: 36,
    borderRadius: RADIUS.r50,
    borderWidth: 1,
    paddingHorizontal: SPACE.s14,
    paddingVertical: 0,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
  commentSubmit: {
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s7,
  },
  commentSubmitText: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.semiBold,
    letterSpacing: 2,
    color: COLORS.white,
  },
  // ── Comment sheet (bottom-sheet overlay)
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: withAlpha(COLORS.black, 0.5),
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: RADIUS.r16,
    borderTopRightRadius: RADIUS.r16,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignItems: 'center',
    paddingTop: SPACE.s10,
    paddingBottom: SPACE.s12,
    gap: SPACE.s8,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: RADIUS.r2,
  },
  sheetTitle: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    letterSpacing: 2,
  },
  sheetEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetEmptyText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
  // ── Empty / error
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
  },
  pointsOverlay: {
    color: COLORS.white,
  },
  lockedCard: {
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s32,
    gap: SPACE.s16,
  },
  lockedWho: {
    alignItems: 'center',
    gap: SPACE.s8,
  },
  lockedAvatar: {
    width: 88,
    height: 88,
    borderRadius: RADIUS.r44,
    borderWidth: 2,
  },
  lockedName: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.bold,
  },
  lockedTime: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1,
    opacity: 0.7,
  },
  lockedHint: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.italic,
    textAlign: 'center',
  },
  lockedButton: {
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s14,
    paddingHorizontal: SPACE.s32,
  },
  lockedButtonText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
    letterSpacing: 3,
  },
  empty: {
    alignItems: 'center',
    paddingTop: SPACE.s80,
    gap: SPACE.s8,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.bold,
    letterSpacing: 6,
  },
  emptySub: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
    textAlign: 'center',
    paddingHorizontal: SPACE.s32,
  },
  errorText: {
    textAlign: 'center',
    padding: SPACE.s16,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
});
