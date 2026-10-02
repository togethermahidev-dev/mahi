import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  RefreshControl,
  StyleSheet,
  Animated,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeGesture } from 'react-native-gesture-handler';
import { useAnimatedRef, useScrollOffset, type SharedValue } from 'react-native-reanimated';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeed } from '@/hooks/useFeed';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useRailRoom } from '@/hooks/useChrome';
import { answersATag } from '@/lib/reactivePosting';
import FeedLockBanner from '@/components/FeedLockBanner';
import { useSocialStore, useAuthStore } from '@/store';
import UserProfileScreen from '@/screens/UserProfileScreen';
import GestureScrollView, { ListGestureContext } from '@/components/GestureScrollView';
import PostCard from '@/components/PostCard';
import CommentSheet from '@/components/CommentSheet';
import { relativeTime } from '@/lib/relativeTime';
import { streakText } from '@/lib/streakText';
import { lockedPostText } from '@/lib/feedLock';
import { shouldPlay } from '@/lib/videoPosts';
import { appHeaderHeight } from '@/lib/pip';
import { atListTop } from '@/lib/swipeRules';
import type { FeedPost } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  SPACE,
  RADIUS,
  BORDER_WIDTH,
  SIZE,
} from '@/constants/tokens';

// ─── LockedPostItem ──────────────────────────────────────────────────────────

/** A friend's post while the viewer's feed is locked: who and when, no photo or caption. */
function LockedPostItem({
  item,
  height,
  text,
  onAvatarPress,
  onUnlockPress,
  topSpace = 0,
}: {
  item: FeedPost;
  /** What to say, and a button only when the viewer can post. */
  text: { hint: string; button?: string };
  /** Card height: one full screen (TikTok-style snap). */
  height: number;
  onAvatarPress: (userId: string) => void;
  onUnlockPress: () => void;
  /** Room kept at the top for the lock card over the first post. */
  topSpace?: number;
}) {
  const { colors } = useAppTheme();
  // Centred, and clear of the glass bar on the left (the same room on both sides keeps it centred).
  const railRoom = useRailRoom();
  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();
  const streak = streakText(item.streak_day);
  return (
    <View
      style={[
        styles.lockedCard,
        {
          backgroundColor: colors.offBlack,
          height,
          paddingTop: topSpace,
          paddingHorizontal: Math.max(SPACE.s32, railRoom),
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.lockedWho, pressed && { opacity: 0.75 }]}
        onPress={() => onAvatarPress(item.profiles.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s profile`}
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
          posted {relativeTime(item.created_at)}
          {streak ? ` · ${streak}` : ''}
        </Text>
      </Pressable>
      <Text style={[styles.lockedHint, { color: colors.offWhite }]}>{text.hint}</Text>
      {text.button ? (
        <Pressable
          style={({ pressed }) => [
            styles.lockedButton,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.85 },
          ]}
          onPress={onUnlockPress}
          accessibilityRole="button"
          accessibilityLabel={text.button}
        >
          <Text style={[styles.lockedButtonText, { color: colors.offBlack }]}>{text.button}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── FeedScreen ──────────────────────────────────────────────────────────────

interface FeedScreenProps {
  /** Take the user to the camera (used by locked posts). */
  onGoToCamera?: () => void;
  /** Open people search (the empty feed's "Find friends" button). */
  onFindFriends?: () => void;
  headerAnim?: Animated.Value;
  onOverlayChange?: (active: boolean) => void;
  /** The list's scrolling as a gesture, so the Camera ↕ Feed swipe can run alongside it. */
  listGesture?: NativeGesture;
  /** How far the list is scrolled, kept up to date on the UI thread for the Camera ↕ Feed swipe. */
  listOffset?: SharedValue<number>;
  /** The Feed is the screen showing (video posts play only then). */
  isActive?: boolean;
}

export default function FeedScreen({
  onGoToCamera,
  onFindFriends,
  headerAnim,
  onOverlayChange,
  listGesture,
  listOffset,
  isActive = true,
}: FeedScreenProps = {}): React.JSX.Element {
  const { dark } = useAppTheme();
  const headerH = appHeaderHeight(useSafeAreaInsets().top);
  const railRoom = useRailRoom();
  // TikTok-style snap: each card fills the full screen height.
  const { width: screenWidth, height: cardHeight } = useWindowDimensions();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);

  const {
    posts,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
    locked,
    unlockedUntil,
    serverOffsetMs,
    loaded,
  } = useFeed();

  // Lock card / feed timer under the header. It floats over the first post (a list header would
  // knock the full-screen snapping out of step), so the first post keeps room for it.
  const lockExplainer = useFeatureFlag('feed-lock-explainer');
  const [bannerH, setBannerH] = useState(0);
  const topSpace = lockExplainer && bannerH > 0 ? bannerH + SPACE.s8 : 0;

  // Friends' posts while locked: a button only when reactive posting lets you post (a tag still
  // open on the server clock, or your first post).
  const tagged = answersATag(useOpenTags().openTags, serverOffsetMs);
  const postedBefore = unlockedUntil !== null;
  const lockedText = useMemo(
    () => lockedPostText({ tagged, postedBefore }),
    [tagged, postedBefore]
  );

  // Profile overlay, conversation overlay, and comment sheet — lifted to
  // FeedScreen so overlays cover the full screen (not just the PostCard)
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Video posts: the card in view plays (muted, looping) while the Feed is on screen and no
  // profile covers it; the sound choice is shared across the feed for this session only.
  const [inViewId, setInViewId] = useState<string | null>(null);
  const [feedMuted, setFeedMuted] = useState(true);
  const toggleFeedMuted = useCallback(() => setFeedMuted((m) => !m), []);
  const feedOnScreen = isActive && !profileUserId;
  const listExtra = useMemo(
    () => ({ topSpace, railRoom, lockedText, inViewId, feedMuted, feedOnScreen }),
    [topSpace, railRoom, lockedText, inViewId, feedMuted, feedOnScreen]
  );

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
      setInViewId(viewableItems[0]?.key ?? null);
    },
    []
  );

  // ── Scroll-driven header hide/show ───────────────────────────────────────
  const [localHeaderAnim] = useState(() => new Animated.Value(0));
  const headerOffset = headerAnim ?? localHeaderAnim;

  // The swipe reads where the list is on the UI thread, in step with the finger.
  const listRef = useAnimatedRef<FlashListRef<FeedPost>>();
  useScrollOffset(listRef, listOffset);

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;

    // Show header on first card, hide on all others
    const target = atListTop(y) ? 0 : headerH;
    Animated.timing(headerOffset, {
      toValue: target,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <ListGestureContext.Provider value={listGesture}>
        <FlashList
          ref={listRef}
          renderScrollComponent={GestureScrollView}
          data={posts}
          keyExtractor={(item) => item.id}
          extraData={listExtra}
          renderItem={({ item, index }) =>
            item.locked ? (
              <LockedPostItem
                item={item}
                height={cardHeight}
                text={lockedText}
                onAvatarPress={handleAvatarPress}
                onUnlockPress={() => onGoToCamera?.()}
                topSpace={index === 0 ? topSpace : 0}
              />
            ) : (
              <PostCard
                item={item}
                dark={dark}
                width={screenWidth}
                height={cardHeight}
                onAvatarPress={handleAvatarPress}
                onCommentPress={setCommentPostId}
                topSpace={index === 0 ? topSpace : 0}
                leftSpace={railRoom}
                playing={shouldPlay({ screenActive: feedOnScreen, inView: inViewId === item.id })}
                soundOff={feedMuted}
                onToggleMuted={toggleFeedMuted}
              />
            )
          }
          getItemType={(item) => (item.locked ? 'locked' : 'post')}
          snapToInterval={cardHeight}
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
              // Starts below the header, which floats over the list and grows with the notch.
              <View style={[styles.empty, { paddingTop: headerH + SPACE.s24 + topSpace }]}>
                <Text style={[styles.emptyTitle, { color: text }]}>No posts yet</Text>
                <Text style={[styles.emptySub, { color: muted }]}>
                  Workouts from you and your friends show up here.
                </Text>
                {onFindFriends ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.lockedButton,
                      styles.emptyButton,
                      { backgroundColor: COLORS.accent },
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={onFindFriends}
                    accessibilityRole="button"
                    accessibilityLabel="Find friends"
                  >
                    <Text style={[styles.lockedButtonText, { color: COLORS.offBlack }]}>
                      Find friends
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
          ListFooterComponent={
            error ? (
              <Text style={[styles.errorText, { color: muted }]}>Failed to load feed</Text>
            ) : null
          }
        />
      </ListGestureContext.Provider>

      {lockExplainer && loaded ? (
        <Animated.View
          pointerEvents="box-none"
          onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}
          style={[
            styles.lockBanner,
            {
              top: headerH,
              // Slides away with the header once the first post scrolls off.
              transform: [
                {
                  translateY: headerOffset.interpolate({
                    inputRange: [0, headerH],
                    outputRange: [0, -(headerH + bannerH)],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        >
          <FeedLockBanner
            locked={locked}
            unlockedUntil={unlockedUntil}
            serverOffsetMs={serverOffsetMs}
            onPost={() => onGoToCamera?.()}
          />
        </Animated.View>
      ) : null}

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
      <CommentSheet postId={commentPostId} dark={dark} onClose={() => setCommentPostId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  lockedCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s16,
  },
  lockedWho: {
    alignItems: 'center',
    gap: SPACE.s8,
  },
  lockedAvatar: {
    width: SIZE.z88,
    height: SIZE.z88,
    borderRadius: RADIUS.r44,
    borderWidth: BORDER_WIDTH.w2,
  },
  lockedName: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.bold,
  },
  lockedTime: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
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
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  lockBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: SPACE.s16,
  },
  empty: {
    alignItems: 'center',
    gap: SPACE.s8,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.bold,
  },
  emptySub: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
    textAlign: 'center',
    paddingHorizontal: SPACE.s32,
  },
  emptyButton: {
    marginTop: SPACE.s16,
  },
  errorText: {
    textAlign: 'center',
    padding: SPACE.s16,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
});
