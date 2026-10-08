import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  AccessibilityInfo,
  View,
  Text,
  RefreshControl,
  StyleSheet,
  Animated,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeGesture } from 'react-native-gesture-handler';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { refreshTint } from '@/lib/themeColors';
import { usePageSize } from '@/hooks/useChrome';
import { useFeed } from '@/hooks/useFeed';
import { useOpenTags } from '@/hooks/useOpenTags';
import { answersATag } from '@/lib/reactivePosting';
import FeedLockBanner from '@/components/FeedLockBanner';
import { Skeleton } from '@/components/Motion';
import { useSocialStore, useAuthStore, useChromeStore, useFeedStore } from '@/store';
import UserProfileScreen from '@/screens/UserProfileScreen';
import GestureScrollView, { ListGestureContext } from '@/components/GestureScrollView';
import FeedRow from '@/components/FeedRow';
import PostViewer from '@/components/PostViewer';
import type { MorphSource } from '@/lib/morph';
import CommentSheet from '@/components/CommentSheet';
import { lockExplainer as lockCardFor } from '@/lib/feedLock';
import { feedLockMoment, haptic } from '@/lib/haptics';
import { developPlan, developWords } from '@/lib/feedDevelop';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { BlurView } from 'expo-blur';
import Reanimated, {
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { shouldPlay } from '@/lib/videoPosts';
import { appHeaderHeight } from '@/lib/pip';
import { atListTop } from '@/lib/swipeRules';
import type { FeedPost } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  DURATION,
  FONT_SIZE,
  MOTION,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

const AnimatedBlur = Reanimated.createAnimatedComponent(BlurView);

// ─── DevelopCover ────────────────────────────────────────────────────────────

/**
 * A mate's post "developing" after you post: frosted, then sharper, then clear, `delay` ms after
 * the feed opened (order and words: src/lib/feedDevelop.ts). Reduce Motion: every post clears
 * together, as a plain fade.
 */
function DevelopCover({ delay, words }: { delay: number; words: string | null }) {
  const reduceMotion = useReducedMotion();
  const level = useSharedValue(1);
  useEffect(() => {
    level.value = withDelay(
      delay,
      withTiming(0, {
        duration: reduceMotion ? DURATION.d300 : MOTION.develop.ms,
        reduceMotion: ReduceMotion.Never,
      })
    );
  }, [delay, reduceMotion, level]);
  const blurProps = useAnimatedProps(() => ({ intensity: level.value * MOTION.develop.fromBlur }));
  const fade = useAnimatedStyle(() => ({ opacity: Math.min(1, level.value * 2) }));
  return (
    <Reanimated.View
      style={[StyleSheet.absoluteFill, fade]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AnimatedBlur tint="dark" animatedProps={blurProps} style={StyleSheet.absoluteFill} />
      {words ? (
        <View style={styles.developWordsSpot}>
          <Text style={styles.developWords}>{words}</Text>
        </View>
      ) : null}
    </Reanimated.View>
  );
}

// ─── FeedScreen ──────────────────────────────────────────────────────────────

/** The divider between rows: a hairline in the theme's faint border colour. */
function RowGap() {
  const { colors } = useAppTheme();
  return <View style={[styles.rowGap, { backgroundColor: colors.border }]} />;
}

interface FeedScreenProps {
  /** Take the user to the camera (used by locked posts). */
  onGoToCamera?: () => void;
  /** Open people search (the empty feed's "Find friends" button). */
  onFindFriends?: () => void;
  headerAnim?: Animated.Value;
  onOverlayChange?: (active: boolean) => void;
  /** The list's scrolling as a gesture, so the sideways page swipe can run alongside it. */
  listGesture?: NativeGesture;
  /** The Feed is the screen showing (video posts play only then). */
  isActive?: boolean;
  /** Extra room at the top, under the header: the camera's small card sits there. */
  topInset?: number;
}

export default function FeedScreen({
  onGoToCamera,
  onFindFriends,
  headerAnim,
  onOverlayChange,
  listGesture,
  isActive = true,
  topInset = 0,
}: FeedScreenProps = {}): React.JSX.Element {
  const { dark } = useAppTheme();
  const headerH = appHeaderHeight(useSafeAreaInsets().top);
  // A photo being pinched holds the list still.
  const zooming = useChromeStore((s) => s.zooming);
  // TikTok-style snap: each card fills the page (the screen, or the space above the tab bar).
  const { width: screenWidth, height: cardHeight } = usePageSize();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  // Rows sit on the page's own background with a barely-there hairline between them, like the
  // Messages rows (owner, 2026-10-08: no blue lines).
  const listBg = bg;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted, accentText } = themeColors(dark);
  const skeletonFill = withAlpha(text, ALPHA.a10);
  const skeletonBlock = withAlpha(text, ALPHA.a30);

  const {
    posts,
    error,
    hasMore,
    isLoadingMore,
    loadMore,
    refresh,
    locked,
    unlockedUntil,
    serverOffsetMs,
    loaded,
  } = useFeed();
  // Loading only until this session's first page arrives or the read fails, so a failed first
  // read shows an error instead of spinning for ever.
  const firstLoad = !loaded && !error && posts.length === 0;
  // The pull-to-refresh spinner turns only for a pull; the first load has its own spinner.
  const [pulling, setPulling] = useState(false);
  const onPull = useCallback(async () => {
    setPulling(true);
    try {
      await useFeedStore.getState().sync(true);
    } finally {
      setPulling(false);
    }
  }, []);

  // The feed locking or opening is felt once, by someone looking at it (on arrival if it changed
  // while they were on another screen).
  const lockSeen = useRef<boolean | null>(null);
  // Posts seen locked this session: when the feed opens, they "develop" one by one.
  const reduceMotion = useReducedMotion();
  const developOn = useFeatureFlag('feed-develop');
  const seenLocked = useRef(new Set<string>());
  const postsNow = useRef(posts);
  postsNow.current = posts;
  useEffect(() => {
    for (const p of posts) if (p.locked) seenLocked.current.add(p.id);
  }, [posts]);
  const [develop, setDevelop] = useState<{
    plan: Map<string, number>;
    first: string | null;
    words: string | null;
  } | null>(null);
  useEffect(() => {
    const felt = feedLockMoment({ seen: lockSeen.current, locked, loaded, onScreen: isActive });
    lockSeen.current = felt.seen;
    if (felt.moment) haptic(felt.moment);
    const viewerId = useAuthStore.getState().user?.id;
    if (felt.moment === 'feedUnlocked' && viewerId && developOn) {
      const fresh = postsNow.current;
      const plan = developPlan({
        posts: fresh,
        previouslyLocked: [...seenLocked.current],
        viewerId,
        reduceMotion,
      });
      seenLocked.current.clear();
      if (plan.size > 0) {
        const words = developWords({ posts: fresh, viewerId });
        setDevelop({ plan, first: [...plan.keys()][0] ?? null, words });
        // The words sit on a cover VoiceOver skips: say them once instead.
        if (words) AccessibilityInfo.announceForAccessibility(words);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, loaded, isActive]);
  // Once every post has cleared, the covers go.
  useEffect(() => {
    if (!develop) return;
    const last = Math.max(...develop.plan.values());
    const id = setTimeout(() => setDevelop(null), last + MOTION.develop.ms + DURATION.d300);
    return () => clearTimeout(id);
  }, [develop]);

  // Lock card / feed timer under the header. It floats over the first post (a list header would
  // knock the full-screen snapping out of step), so the first post keeps room for it.
  const [bannerH, setBannerH] = useState(0);
  // Locked, the pill floats mid-feed over the frosted rows and takes no room (its wrapper spans
  // the whole feed, so its height must not push the rows off the screen — 13.12).
  const topSpace = !locked && bannerH > 0 ? bannerH + SPACE.s8 : 0;

  // Friends' posts while locked: a button only when reactive posting lets you post (a tag still
  // open on the server clock, or your first post).
  const { openTags, loaded: tagsLoaded } = useOpenTags();
  const tagged = answersATag(openTags, serverOffsetMs);
  const postedBefore = unlockedUntil !== null;

  // A locked feed shows one main button: the lock card's. When that card already offers Find
  // friends, the empty state drops its own; otherwise its Find friends is a plain text link.
  const lockCardShown = loaded && locked && tagsLoaded;
  const lockCardTarget = lockCardShown
    ? lockCardFor({ locked, unlockedUntil, openTags, serverOffsetMs })?.target
    : undefined;
  const emptyFindFriends =
    !onFindFriends || lockCardTarget === 'friends' ? 'none' : lockCardShown ? 'link' : 'button';

  // Profile overlay, conversation overlay, and comment sheet — lifted to
  // FeedScreen so overlays cover the full screen (not just the PostCard)
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  // A tapped row grows into the full-screen feed (TikTok style) through the shared morph.
  const [viewerPost, setViewerPost] = useState<{
    postId: string;
    source: MorphSource | null;
  } | null>(null);
  const openPost = useCallback((postId: string, source: MorphSource | null) => {
    setViewerPost({ postId, source });
  }, []);
  // Tapping a locked row: the padlock line wiggles "no" (each tap bumps the count).
  const [lockShake, setLockShake] = useState(0);
  const onLockedPress = useCallback(() => setLockShake((n) => n + 1), []);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Video posts: the card in view plays (muted, looping) while the Feed is on screen and no
  // profile covers it; the sound choice is shared across the feed for this session only.
  const [inViewId, setInViewId] = useState<string | null>(null);
  const [feedMuted, setFeedMuted] = useState(true);
  const toggleFeedMuted = useCallback(() => setFeedMuted((m) => !m), []);
  const feedOnScreen = isActive && !profileUserId && !viewerPost;
  const listExtra = useMemo(
    () => ({ topSpace, inViewId, feedMuted, feedOnScreen, develop }),
    [topSpace, inViewId, feedMuted, feedOnScreen, develop]
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

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;

    // Show header on first card, hide on all others
    const target = atListTop(y) ? 0 : headerH;
    Animated.timing(headerOffset, {
      toValue: target,
      duration: DURATION.d150,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={[styles.root, { backgroundColor: posts.length ? listBg : bg }]}>
      <ListGestureContext.Provider value={listGesture}>
        <FlashList
          // The app header is an intentional overlay. Prevent iOS from adding its own safe-area
          // inset as well, which otherwise leaves a visible strip above the first full-screen post.
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          scrollEnabled={!zooming}
          renderScrollComponent={GestureScrollView}
          data={posts}
          keyExtractor={(item) => item.id}
          extraData={listExtra}
          renderItem={({ item }) => (
            <View>
              <FeedRow
                item={item}
                width={screenWidth}
                onOpen={openPost}
                onAvatarPress={handleAvatarPress}
                onCommentPress={setCommentPostId}
                onLockedPress={onLockedPress}
              />
              {develop?.plan.has(item.id) ? (
                <DevelopCover
                  delay={develop.plan.get(item.id) ?? 0}
                  words={develop.first === item.id ? develop.words : null}
                />
              ) : null}
            </View>
          )}
          ItemSeparatorComponent={RowGap}
          // The list starts under the floating header (and the lock pill, when there is one).
          contentContainerStyle={{ paddingTop: posts.length ? headerH + topInset + topSpace : 0 }}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.moreLoader} accessibilityLabel="Loading more posts">
                <ActivityIndicator color={muted} />
              </View>
            ) : error && posts.length > 0 ? (
              <Text style={[styles.errorText, { color: muted }]}>
                Couldn’t load more. Pull down to try again.
              </Text>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onViewableItemsChanged={handleViewableChange}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          refreshControl={
            <RefreshControl refreshing={pulling} onRefresh={onPull} {...refreshTint(dark)} />
          }
          ListEmptyComponent={
            // Each starts below the header, which floats over the list and grows with the notch.
            firstLoad ? (
              // A post-shaped placeholder that breathes until the first page lands.
              <View
                style={[styles.skeleton, { height: cardHeight }]}
                accessible
                accessibilityLabel="Loading"
              >
                <Skeleton style={[StyleSheet.absoluteFill, { backgroundColor: skeletonFill }]} />
                <View style={styles.skeletonFoot}>
                  <View style={styles.skeletonWho}>
                    <Skeleton style={[styles.skeletonAvatar, { backgroundColor: skeletonBlock }]} />
                    <Skeleton style={[styles.skeletonName, { backgroundColor: skeletonBlock }]} />
                  </View>
                  <Skeleton style={[styles.skeletonLine, { backgroundColor: skeletonBlock }]} />
                </View>
              </View>
            ) : error ? (
              <View style={[styles.empty, { paddingTop: headerH + SPACE.s24 + topSpace }]}>
                <Text style={[styles.emptyTitle, { color: text }]} accessibilityRole="header">
                  Couldn’t load your feed
                </Text>
                <Text style={[styles.emptySub, { color: muted }]}>
                  Check your connection and try again.
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.lockedButton,
                    styles.emptyButton,
                    { backgroundColor: COLORS.accent },
                    pressed && { opacity: ALPHA.a85 },
                  ]}
                  onPress={refresh}
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                >
                  <Text style={[styles.lockedButtonText, { color: COLORS.offBlack }]}>
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.empty, { paddingTop: headerH + SPACE.s24 + topSpace }]}>
                {/* The feed shows anyone you follow (#3); following each other is only for tags. */}
                <Text style={[styles.emptyTitle, { color: text }]}>No posts yet</Text>
                <Text style={[styles.emptySub, { color: muted }]}>
                  Follow people to see their workouts here.
                </Text>
                {emptyFindFriends === 'link' ? (
                  <Pressable
                    style={({ pressed }) => [styles.textLink, pressed && { opacity: ALPHA.a75 }]}
                    onPress={onFindFriends}
                    accessibilityRole="button"
                    accessibilityLabel="Find friends"
                  >
                    <Text style={[styles.textLinkLabel, { color: accentText }]}>Find friends</Text>
                  </Pressable>
                ) : emptyFindFriends === 'button' ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.lockedButton,
                      styles.emptyButton,
                      { backgroundColor: COLORS.accent },
                      pressed && { opacity: ALPHA.a85 },
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
            )
          }
        />
      </ListGestureContext.Provider>

      {loaded ? (
        <Animated.View
          pointerEvents="box-none"
          onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}
          style={[
            styles.lockBanner,
            locked && posts.length > 0 && styles.lockBannerCentred,
            {
              top: headerH + topInset,
              // Open: the timer slides away with the header once the first post scrolls off.
              // Locked: the padlock line stays put while the blurred rows scroll behind it
              // (owner, 2026-10-08).
              transform: locked
                ? []
                : [
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
            shake={lockShake}
            locked={locked}
            unlockedUntil={unlockedUntil}
            serverOffsetMs={serverOffsetMs}
            onPost={() => onGoToCamera?.()}
            onFindFriends={onFindFriends}
          />
        </Animated.View>
      ) : null}

      {/* A tapped row, full screen: up and down through the feed, as before (TikTok style). */}
      <PostViewer
        from="feed"
        userId=""
        postId={viewerPost?.postId ?? null}
        source={viewerPost?.source}
        onClose={() => setViewerPost(null)}
        onOpenProfile={(id) => {
          setViewerPost(null);
          if (id !== currentUserId) setProfileUserId(id);
        }}
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
      <CommentSheet postId={commentPostId} dark={dark} onClose={() => setCommentPostId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  developWordsSpot: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s32,
  },
  developWords: {
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f17,
    textAlign: 'center',
  },
  root: {
    flex: 1,
  },
  // A full point, not a hairline: a hairline (a third of a pixel) rounded away on some rows.
  rowGap: {
    height: BORDER_WIDTH.w1,
    marginHorizontal: SPACE.s16,
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
  // A locked feed: the lock pill floats in the middle of the frosted rows.
  lockBannerCentred: {
    bottom: 0,
    justifyContent: 'center',
  },
  skeleton: {
    justifyContent: 'flex-end',
  },
  moreLoader: {
    height: SIZE.z56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonFoot: {
    padding: SPACE.s16,
    paddingBottom: SPACE.s80,
    gap: SPACE.s12,
  },
  skeletonWho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s10,
  },
  skeletonAvatar: {
    width: SIZE.z40,
    height: SIZE.z40,
    borderRadius: RADIUS.r20,
  },
  skeletonName: {
    width: SIZE.z160,
    height: SIZE.z10 + SIZE.z4,
    borderRadius: RADIUS.r8,
  },
  skeletonLine: {
    width: '70%',
    height: SIZE.z10,
    borderRadius: RADIUS.r8,
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
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingHorizontal: SPACE.s32,
  },
  emptyButton: {
    marginTop: SPACE.s16,
  },
  textLink: {
    minHeight: SIZE.z44,
    paddingHorizontal: SPACE.s16,
    justifyContent: 'center',
    marginTop: SPACE.s8,
  },
  textLinkLabel: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
  },
  errorText: {
    textAlign: 'center',
    padding: SPACE.s16,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
  },
});
