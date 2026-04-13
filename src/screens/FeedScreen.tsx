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
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeed } from '@/hooks/useFeed';
import { useFeedStore, useSocialStore, useUserStore, useAuthStore } from '@/store';
import { LikeIcon, HeartIcon, CommentIcon } from '@/components/ScreenIcons';
import UserProfileScreen from '@/screens/UserProfileScreen';
import TaggedBubbleStack from '@/components/TaggedBubbleStack';
import CaptionText from '@/components/CaptionText';
import type { FeedPost } from '@/api';
import type { CommentWithProfile } from '@/api/social';

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
  if (secs < 60)  return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── CommentRow ──────────────────────────────────────────────────────────────

function CommentRow({ comment, dark }: { comment: CommentWithProfile; dark: boolean }) {
  const text   = dark ? '#E8E8E3' : '#1A1A17';
  const muted  = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const name   = comment.profiles.display_name ?? comment.profiles.username;
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
  const text   = dark ? '#E8E8E3' : '#1A1A17';
  const muted  = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const border = dark ? 'rgba(232,232,227,0.1)'  : 'rgba(26,26,23,0.1)';
  const cardBg = dark ? '#252521' : '#F5F5F0';

  const name     = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();

  const [rearIsPrimary, setRearIsPrimary] = useState(true);

  // ── Store selectors ──────────────────────────────────────────────────────
  const currentUser  = useUserStore((s) => s.profile);
  const likedByMe    = useSocialStore((s) => s.likedByMe[item.id] ?? item.liked_by_me);
  const likeCount    = useFeedStore((s) => {
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
  const hasDual    = !!item.pov_image_url;
  const primaryUrl = hasDual && !rearIsPrimary ? item.pov_image_url! : item.image_url;
  const pipUrl     = hasDual && !rearIsPrimary ? item.image_url : item.pov_image_url;

  // ── Draggable PIP (FaceTime-style) ──────────────────────────────────────
  const containerH = CARD_HEIGHT;
  const initialPipX = 12;
  const initialPipY = APP_HEADER_H + 8;
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

  const margin = 8;
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
      pipTransX.value = Math.max(margin, Math.min(rawX, width - FEED_PIP_W - margin));
      pipTransY.value = Math.max(margin, Math.min(rawY, containerH - FEED_PIP_H - margin));
    })
    .onEnd(() => {
      'worklet';
      // Snap to nearest corner
      const midX = (width - FEED_PIP_W) / 2;
      const midY = (containerH - FEED_PIP_H) / 2;
      const snapX = pipTransX.value < midX ? margin : width - FEED_PIP_W - margin;
      const snapY = pipTransY.value < midY ? margin : containerH - FEED_PIP_H - margin;
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
      setRearIsPrimary(p => !p);
    });

  const pipGesture = Gesture.Race(pipPanGesture, pipTapGesture);

  // ── Double-tap medal burst animation ─────────────────────────────────────
  const medalScale   = useRef(new Animated.Value(0)).current;
  const medalOpacity = useRef(new Animated.Value(0)).current;
  const [medalPos, setMedalPos]       = useState({ x: 0, y: 0 });
  const [showMedal, setShowMedal]     = useState(false);

  const triggerMedalBurst = useCallback((x: number, y: number) => {
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
  }, [medalScale, medalOpacity]);

  const handleDoubleTap = useCallback((x: number, y: number) => {
    console.log('[FeedScreen] double-tap post', item.id, '| likedByMe:', likedByMe, '| user:', currentUser?.id);
    if (!currentUser) { console.warn('[FeedScreen] double-tap: no currentUser'); return; }
    if (!likedByMe) {
      console.log('[FeedScreen] double-tap → toggleLike (like)');
      useSocialStore.getState().toggleLike(item.id, currentUser.id);
    } else {
      console.log('[FeedScreen] double-tap → already liked, skipping');
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerMedalBurst(x, y);
  }, [currentUser, likedByMe, item.id, triggerMedalBurst]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd((e) => {
      handleDoubleTap(e.x, e.y);
    });

  // ── Like handler (action bar tap) ───────────────────────────────────────
  const handleLike = useCallback(() => {
    console.log('[FeedScreen] like button tap post', item.id, '| likedByMe:', likedByMe, '| user:', currentUser?.id);
    if (!currentUser) { console.warn('[FeedScreen] like: no currentUser'); return; }
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
          <View style={{ width, flex: 1 }}>
            <Image
              source={{ uri: primaryUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            {/* Top gradient — streak badge only */}
            <LinearGradient
              colors={['rgba(0,0,0,0.6)', 'transparent']}
              style={styles.postOverlay}
            >
              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>DAY {item.streak_day}</Text>
              </View>
            </LinearGradient>
            {/* Bottom gradient — profile row + caption */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
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
                  <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                    <Text style={styles.avatarInitial}>{initials}</Text>
                  </View>
                )}
                <View style={styles.userInfo}>
                  <Text style={styles.usernameOverlay}>{name}</Text>
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
                    top:  medalPos.y - 40,
                    transform: [{ scale: medalScale }],
                    opacity:   medalOpacity,
                  },
                ]}
              >
                <HeartIcon size={80} color="#FFFFFF" filled />
              </Animated.View>
            )}
          </View>
        </GestureDetector>
        {/* Tagged user bubbles — overlay on photo, bottom-left auto-stack.
            Rendered BEFORE the PIP so the draggable PIP paints on top. */}
        <TaggedBubbleStack
          users={item.tagged_users}
          onPressUser={(u) => onAvatarPress(u.user_id)}
        />
        {/* Draggable PIP — uses RNGH so it wins over scroll/navigation gestures */}
        {hasDual && pipUrl && (
          <GestureDetector gesture={pipGesture}>
            <Reanimated.View style={[styles.feedPip, pipAnimStyle]}>
              <Image
                source={{ uri: pipUrl }}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 10 }]}
                resizeMode="cover"
              />
            </Reanimated.View>
          </GestureDetector>
        )}

        {/* ── Right-side action column (Reels / TikTok style) ── */}
        <View style={styles.sideActions} pointerEvents="box-none">
          <TouchableOpacity style={styles.sideActionBtn} onPress={handleLike} activeOpacity={0.7}>
            <HeartIcon size={44} color="#FFFFFF" filled={likedByMe} />
            <Text style={styles.sideActionCount}>{likeCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sideActionBtn} onPress={handleCommentPress} activeOpacity={0.7}>
            <CommentIcon size={42} color="#FFFFFF" />
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
  const text   = dark ? '#E8E8E3' : '#1A1A17';
  const muted  = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const border = dark ? 'rgba(232,232,227,0.1)'  : 'rgba(26,26,23,0.1)';
  const sheetBg = dark ? '#252521' : '#F5F5F0';

  const [commentText, setCommentText] = useState('');
  const currentUser = useUserStore((s) => s.profile);
  const comments    = useSocialStore((s) => s.comments[postId]);
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
      id:           currentUser.id,
      username:     currentUser.username,
      display_name: currentUser.display_name ?? null,
      avatar_url:   currentUser.avatar_url   ?? null,
    });
    setCommentText('');
    Keyboard.dismiss();
  }, [commentText, postId, currentUser]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.sheetBackdrop}
        activeOpacity={1}
        onPress={dismiss}
      />
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
              renderItem={({ item: comment }) => (
                <CommentRow comment={comment} dark={dark} />
              )}

            />
          ) : (
            <View style={styles.sheetEmpty}>
              <Text style={[styles.sheetEmptyText, { color: muted }]}>No comments yet</Text>
            </View>
          )}
        </View>

        {/* Comment input */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
              style={[styles.commentSubmit, { backgroundColor: '#59c2d7' }]}
              onPress={handleSubmitComment}
              activeOpacity={0.75}
            >
              <Text style={styles.commentSubmitText}>SEND</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

// ─── FeedScreen ──────────────────────────────────────────────────────────────

interface FeedScreenProps {
  onScrollTopChange?: (atTop: boolean) => void;
  headerAnim?: Animated.Value;
  onOverlayChange?: (active: boolean) => void;
}

export default function FeedScreen({ onScrollTopChange, headerAnim, onOverlayChange }: FeedScreenProps = {}): React.JSX.Element {
  const { dark } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const bg    = dark ? '#1C1C19' : '#FFFFFF';
  const text  = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';

  const { posts, isLoading, error, hasMore, loadMore, refresh } = useFeed();

  // Profile overlay, conversation overlay, and comment sheet — lifted to
  // FeedScreen so overlays cover the full screen (not just the PostItem card)
  const [profileUserId, setProfileUserId]   = useState<string | null>(null);
  const [commentPostId, setCommentPostId]   = useState<string | null>(null);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Notify parent when a fullscreen overlay (profile) opens/closes
  const feedOverlay = !!profileUserId;
  const prevFeedOverlay = useRef(false);
  if (feedOverlay !== prevFeedOverlay.current) {
    prevFeedOverlay.current = feedOverlay;
    onOverlayChange?.(feedOverlay);
  }

  const handleAvatarPress = useCallback((userId: string) => {
    // Don't open overlay for own profile
    if (userId === currentUserId) return;
    setProfileUserId(userId);
  }, [currentUserId]);

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
    [],
  );

  // ── Scroll-driven header hide/show ───────────────────────────────────────
  const localHeaderAnim    = useRef(new Animated.Value(0)).current;
  const headerOffset       = headerAnim ?? localHeaderAnim;

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
    Animated.timing(headerOffset, { toValue: target, duration: 150, useNativeDriver: true }).start();
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <FlashList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostItem
            item={item}
            dark={dark}
            width={screenWidth}
            onAvatarPress={handleAvatarPress}
            onCommentPress={setCommentPostId}
          />
        )}
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
        <CommentSheet
          postId={commentPostId}
          dark={dark}
          onClose={() => setCommentPostId(null)}
        />
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
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: APP_HEADER_H + 4,
    paddingBottom: 32,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontFamily: 'JosefinSans_700Bold',
    color: '#FFFFFF',
  },
  userInfo: {
    gap: 2,
  },
  usernameOverlay: {
    fontSize: 13,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },
  timeOverlay: {
    fontSize: 11,
    fontFamily: 'JosefinSans_400Regular_Italic',
    color: 'rgba(255,255,255,0.75)',
  },
  streakBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  streakText: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  imageContainer: {
    position: 'relative',
  },
  feedPip: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: FEED_PIP_W,
    height: FEED_PIP_H,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
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
    right: 0,
    paddingHorizontal: 12,
    paddingTop: 40,
    paddingBottom: 14,
    gap: 8,
  },
  captionText: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // ── Right-side action column (Reels / TikTok style)
  sideActions: {
    position: 'absolute',
    right: 12,
    bottom: 100,
    alignItems: 'center',
    gap: 20,
  },
  sideActionBtn: {
    alignItems: 'center',
    gap: 4,
  },
  sideActionCount: {
    fontSize: 12,
    fontFamily: 'JosefinSans_600SemiBold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // ── Comment rows (shared by CommentSheet)
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  commentAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  commentAvatarInitial: {
    fontSize: 10,
    fontFamily: 'JosefinSans_700Bold',
  },
  commentBody: {
    flex: 1,
    gap: 2,
  },
  commentUsername: {
    fontSize: 11,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 1,
  },
  commentText: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  commentTime: {
    fontSize: 10,
    fontFamily: 'JosefinSans_400Regular_Italic',
    paddingTop: 2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1,
    height: 36,
    borderRadius: 50,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  commentSubmit: {
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  commentSubmitText: {
    fontSize: 11,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  // ── Comment sheet (bottom-sheet overlay)
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetTitle: {
    fontSize: 12,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
  },
  sheetEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetEmptyText: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  // ── Empty / error
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 6,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    textAlign: 'center',
    padding: 16,
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
});
