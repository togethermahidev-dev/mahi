import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  AccessibilityInfo,
  View,
  Text,
  PixelRatio,
  RefreshControl,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeGesture } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { refreshTint } from '@/lib/themeColors';
import { usePageSize, useTabBarRoom } from '@/hooks/useChrome';
import { useFeed } from '@/hooks/useFeed';
import { useOpenTags } from '@/hooks/useOpenTags';
import { answersATag } from '@/lib/reactivePosting';
import FeedLockBanner from '@/components/FeedLockBanner';
import PushBanner from '@/components/PushBanner';
import { Skeleton } from '@/components/Motion';
import { useSocialStore, useAuthStore, useChromeStore, useFeedStore } from '@/store';
import UserProfileScreen from '@/screens/UserProfileScreen';
import GestureScrollView, { ListGestureContext } from '@/components/GestureScrollView';
import FeedRow from '@/components/FeedRow';
import PostCard from '@/components/PostCard';
import PostViewer from '@/components/PostViewer';
import type { MorphSource } from '@/lib/morph';
import CommentSheet from '@/components/CommentSheet';
import SwitchCameraPill from '@/components/SwitchCameraPill';
import { lockExplainer as lockCardFor } from '@/lib/feedLock';
import { feedLockMoment, haptic } from '@/lib/haptics';
import { developPlan, developWords } from '@/lib/feedDevelop';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { feedListLayout, fullScreenPaging, showsEndNote, snapBack } from '@/lib/feedListLayout';
import { BlurView } from 'expo-blur';
import Reanimated, {
  Easing,
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
import {
  HEADER_START,
  feedChromeOpacity,
  feedTimerSpot,
  headerScroll,
  headerSlide,
} from '@/lib/feedHeader';
import type { FeedPost } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  DURATION,
  FONT_SIZE,
  MOTION,
  POST_FULL,
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

// ─── LockedCard ──────────────────────────────────────────────────────────────

/**
 * A friend's post, full screen, while your feed is locked: the server sends no photo, name or
 * caption, so it is a stand-in (a blank face and name bars where the post's own sit) under frost.
 * The one lock pill floats over the feed (FeedLockBanner); a tap makes it wiggle "no".
 */
function LockedCard({ height, onPress }: { height: number; onPress: () => void }) {
  // On the same dark canvas as every full-screen post, in both themes: nothing between posts is
  // ever white (owner, 2026-10-10).
  const shape = { backgroundColor: withAlpha(COLORS.white, ALPHA.a25) };
  return (
    <Pressable
      style={[styles.lockedCard, { height, backgroundColor: POST_FULL.canvas }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Locked post"
      accessibilityHint="Locked until you post"
    >
      <View style={styles.skeletonFoot}>
        <View style={styles.skeletonWho}>
          <View style={[styles.skeletonAvatar, shape]} />
          <View style={[styles.skeletonName, shape]} />
        </View>
        <View style={[styles.skeletonLine, shape]} />
      </View>
      <BlurView
        intensity={BLUR_INTENSITY.i40}
        tint="dark"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </Pressable>
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
  /** The header's slide away, 0 (shown) to 1 (hidden), set from the list's scrolling here and
   *  drawn by the camera page (src/lib/feedHeader.ts). */
  headerHide?: SharedValue<number>;
  onOverlayChange?: (active: boolean) => void;
  /** The list's scrolling as a gesture, so the sideways page swipe can run alongside it. */
  listGesture?: NativeGesture;
  /** The Feed is the screen showing (video posts play only then). */
  isActive?: boolean;
  /** Extra room at the top, under the header: the camera's small card sits there. */
  topInset?: number;
  /** Full-screen posts: told whether the list is at its first post (the pull down to the camera
   *  works only there, src/lib/feedPull.ts). */
  onTopChange?: (atTop: boolean) => void;
  /** The "Switch to camera" pill shows (switchPillShown) and fades with this morph (0–1). */
  switchPill?: { shown: boolean; morph: SharedValue<number> };
}

export default function FeedScreen({
  onGoToCamera,
  onFindFriends,
  headerHide,
  onOverlayChange,
  listGesture,
  isActive = true,
  topInset = 0,
  onTopChange,
  switchPill,
}: FeedScreenProps = {}): React.JSX.Element {
  const { dark } = useAppTheme();
  const headerH = appHeaderHeight(useSafeAreaInsets().top);
  // A photo being pinched holds the list still.
  const zooming = useChromeStore((s) => s.zooming);
  // TikTok-style snap: each card fills the page (the screen, or the space above the tab bar).
  const { width: screenWidth, height: pageHeight } = usePageSize();
  // The feed as rows (on) or full-screen posts, one per screen (off, the default; owner,
  // 2026-10-09). Geometry: src/lib/feedListLayout.ts.
  const rowsOn = useFeatureFlag('feed-rows');
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
  // Rows only: the pull-to-refresh spinner turns only for a pull; the first load has its own
  // spinner. Full-screen posts refresh each time the feed opens instead: a pull down at the first
  // post brings the camera back (owner, 2026-10-09).
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
  // Notifications off: the "turn on notifications" banner sits above it, at the very top, and
  // always keeps its room (switch `push-core`).
  const [pushH, setPushH] = useState(0);
  const pushSpace = pushH > 0 ? pushH + SPACE.s8 : 0;
  const topSpace = (!locked && bannerH > 0 ? bannerH + SPACE.s8 : 0) + pushSpace;
  const hasPosts = posts.length > 0;
  const layout = useMemo(
    () =>
      feedListLayout({
        rows: rowsOn,
        pageHeight,
        headerH,
        topInset,
        topSpace,
        hasPosts,
        pixelRatio: PixelRatio.get(),
      }),
    [rowsOn, pageHeight, headerH, topInset, topSpace, hasPosts]
  );
  // Full screen: a post's height and the snap are the same whole-pixel number (cardHeight).
  const cardHeight = layout.cardHeight ?? pageHeight;
  // Full-screen posts sit on the posts' own dark canvas in both themes: behind and between them
  // and wherever the list is still catching up, nothing is ever white (owner, 2026-10-10: "no
  // white bar or edges between the scrolls"). With no posts the page keeps its own background,
  // under the words that say so.
  const canvas = !rowsOn && hasPosts;
  // Any bar that floats at the foot of the page (the glass dock on builds without the tab bar).
  const tabRoom = useTabBarRoom();
  // Full screen: one flick moves one post, however hard, as on TikTok and Reels.
  const paging = fullScreenPaging(layout.snapInterval);

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
  // The feed closed under an open profile (the Camera tab was tapped): the profile goes with it,
  // or its overlay would go on blocking the sideways page swipe from the camera.
  if (!isActive && profileUserId) setProfileUserId(null);
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
    () => ({ topSpace, inViewId, feedMuted, feedOnScreen, develop, layout }),
    [topSpace, inViewId, feedMuted, feedOnScreen, develop, layout]
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

  // ── Scroll-driven header hide/show (src/lib/feedHeader.ts) ───────────────
  // One animation per change of direction, on the UI thread, picking up from wherever the header
  // is. (It used to start a new 150 ms animation on every scroll event — sixty a second through a
  // page move — and each restart jumped the header back to a stale start: the glitch.) Reduce
  // Motion: the header fades in place instead (headerSlide), so the timing itself always runs.
  const localHeaderHide = useSharedValue(0);
  const hide = headerHide ?? localHeaderHide;
  const headerState = useRef(HEADER_START);
  const lastY = useRef(0);
  const showHeader = useCallback(
    (shown: boolean) => {
      hide.set(
        withTiming(shown ? 0 : 1, {
          duration: MOTION.feedHeader.ms,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.Never,
        })
      );
    },
    [hide]
  );
  // The feed opening or closing (or leaving this page) always brings the header back, wherever the
  // list is: the camera side keeps the bell circle where it always was (it slides with the header).
  useEffect(() => {
    headerState.current = { shown: true, anchorY: lastY.current };
    showHeader(true);
  }, [isActive, showHeader]);

  // At the first post or not, told to the camera page only when it changes.
  const atTop = useRef(true);
  const tellTop = useCallback(
    (top: boolean) => {
      if (atTop.current === top) return;
      atTop.current = top;
      onTopChange?.(top);
    },
    [onTopChange]
  );
  // A new list (the layout switched) starts at its top, header shown.
  useEffect(() => {
    tellTop(true);
    lastY.current = 0;
    headerState.current = HEADER_START;
    showHeader(true);
  }, [rowsOn, tellTop, showHeader]);

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    lastY.current = y;
    tellTop(atListTop(y));
    // Down hides the header, up (or the top) shows it; it animates only when that flips.
    const next = headerScroll(headerState.current, y);
    if (next.shown !== headerState.current.shown) showHeader(next.shown);
    headerState.current = next;
  };

  const listRef = useRef<FlashListRef<FeedPost>>(null);
  // Full screen: a list left a little off its post goes straight back to it, so no edge of the
  // next post shows. Two fingers starting a pinch can drag the list a few points before it is
  // held still (and again as it lets go), and a page that changes height moves every post.
  const snapInterval = layout.snapInterval;
  useEffect(() => {
    const rest = snapBack(lastY.current, snapInterval, postsNow.current.length);
    if (rest != null) listRef.current?.scrollToOffset({ offset: rest, animated: false });
  }, [zooming, snapInterval]);

  // Full screen: once the feed has closed it goes back to its first post, without animation, so
  // the next time it opens it starts at the top (owner, 2026-10-10: "press the camera then it
  // takes you back to the top where the camera is"; it already refreshes on open). It waits until
  // the closing feed is out of sight, so nothing jumps while it is still on its way out; reopened
  // before then, it goes back at once.
  const backToFirst = useRef(false);
  const toFirstPost = useCallback(() => {
    backToFirst.current = false;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    lastY.current = 0;
    headerState.current = HEADER_START;
    tellTop(true);
  }, [tellTop]);
  useEffect(() => {
    if (rowsOn) return;
    if (isActive) {
      if (backToFirst.current) toFirstPost();
      return;
    }
    if (lastY.current === 0) return;
    backToFirst.current = true;
    const id = setTimeout(toFirstPost, POST_FULL.resetAfterMs);
    return () => clearTimeout(id);
  }, [isActive, rowsOn, toFirstPost]);

  // The notifications banner leaves with the header, all the way off the top.
  const pushDistance = headerH + topInset + pushH;
  const pushStyle = useAnimatedStyle(() => {
    const s = headerSlide(hide.get(), pushDistance, reduceMotion);
    return { opacity: s.opacity, transform: [{ translateY: s.translateY }] };
  });
  // The timer stays put while you page (owner, 2026-10-09: out of the header); it fades in with
  // the feed opening, like the header.
  const morph = switchPill?.morph;
  const timerStyle = useAnimatedStyle(() => ({
    opacity: morph ? feedChromeOpacity(morph.get()) : 1,
  }));
  const timerSpot = useMemo(
    () => feedTimerSpot({ headerH, topInset, pushSpace }),
    [headerH, topInset, pushSpace]
  );

  // Full screen, on the last post: "loading more" or "couldn't load more" (showsEndNote).
  const endNote = showsEndNote({
    rows: rowsOn,
    posts,
    inViewId,
    busy: isLoadingMore,
    failed: !!error,
  });

  return (
    <View style={[styles.root, { backgroundColor: canvas ? POST_FULL.canvas : listBg }]}>
      <ListGestureContext.Provider value={listGesture}>
        <FlashList
          ref={listRef}
          // A fresh list when the layout switches, so no row is recycled as a full-screen post.
          key={rowsOn ? 'rows' : 'full'}
          // Full screen: the list itself is the posts' dark canvas (never the page's white).
          style={canvas ? styles.fullList : undefined}
          // The app header is an intentional overlay. Prevent iOS from adding its own safe-area
          // inset as well, which otherwise leaves a visible strip above the first full-screen post.
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          scrollEnabled={!zooming}
          renderScrollComponent={GestureScrollView}
          data={posts}
          keyExtractor={(item) => item.id}
          extraData={listExtra}
          renderItem={({ item, index }) => (
            <View>
              {rowsOn ? (
                <FeedRow
                  item={item}
                  width={screenWidth}
                  onOpen={openPost}
                  onAvatarPress={handleAvatarPress}
                  onCommentPress={setCommentPostId}
                  onLockedPress={onLockedPress}
                />
              ) : item.locked ? (
                <LockedCard height={cardHeight} onPress={onLockedPress} />
              ) : (
                // Full screen, as before rows (owner, 2026-10-09): the post is already full
                // screen, so a tap doesn't open the viewer; likes, comments and faces work here.
                <PostCard
                  item={item}
                  dark={dark}
                  width={screenWidth}
                  height={cardHeight}
                  onAvatarPress={handleAvatarPress}
                  onCommentPress={setCommentPostId}
                  topSpace={index === 0 ? layout.firstTopSpace : 0}
                  playing={shouldPlay({ screenActive: feedOnScreen, inView: inViewId === item.id })}
                  soundOff={feedMuted}
                  onToggleMuted={toggleFeedMuted}
                />
              )}
              {develop?.plan.has(item.id) ? (
                <DevelopCover
                  delay={develop.plan.get(item.id) ?? 0}
                  words={develop.first === item.id ? develop.words : null}
                />
              ) : null}
            </View>
          )}
          getItemType={(item) => (rowsOn ? 'row' : item.locked ? 'locked' : 'post')}
          ItemSeparatorComponent={rowsOn ? RowGap : undefined}
          {...paging}
          // Rows start under the floating header (and the banners); full-screen posts start at
          // the top, with the header and banners floating over the first one.
          contentContainerStyle={
            canvas
              ? { paddingTop: layout.paddingTop, backgroundColor: POST_FULL.canvas }
              : { paddingTop: layout.paddingTop }
          }
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            // Rows only. Full screen the list is posts and nothing else: a strip under the last
            // post gave the list somewhere to stop that wasn't a post, leaving it out of step
            // with a bar of background showing. Its "loading more" floats over the last post.
            !rowsOn ? null : isLoadingMore ? (
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
            rowsOn ? (
              <RefreshControl refreshing={pulling} onRefresh={onPull} {...refreshTint(dark)} />
            ) : undefined
          }
          // Full screen: no bounce past the first post, so a pull down there moves only the camera
          // morph (CameraFeedPage), never the list.
          bounces={rowsOn}
          overScrollMode={rowsOn ? 'auto' : 'never'}
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

      {/* Notifications off: the banner at the top; it slides away with the header. */}
      <Reanimated.View
        pointerEvents="box-none"
        onLayout={(e) => setPushH(e.nativeEvent.layout.height)}
        style={[styles.lockBanner, { top: headerH + topInset }, pushStyle]}
      >
        <PushBanner />
      </Reanimated.View>

      {loaded ? (
        // Locked: the padlock line stays put mid-feed while the blurred rows scroll behind it
        // (owner, 2026-10-08). Open: the timer floats on its own on the right, under the header's
        // area, and stays put while the header comes and goes (owner, 2026-10-09).
        <Reanimated.View
          pointerEvents="box-none"
          onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}
          style={
            locked
              ? [
                  styles.lockBanner,
                  posts.length > 0 && styles.lockBannerCentred,
                  { top: headerH + topInset + pushSpace },
                ]
              : [styles.timerSpot, timerSpot, timerStyle]
          }
        >
          <FeedLockBanner
            shake={lockShake}
            locked={locked}
            unlockedUntil={unlockedUntil}
            serverOffsetMs={serverOffsetMs}
            onPost={() => onGoToCamera?.()}
            onFindFriends={onFindFriends}
          />
        </Reanimated.View>
      ) : null}

      {/* Full screen, on the last post: more posts loading, or a tap to try again (the pull down
          at the top is the camera's). It floats over the post and takes no room in the list. */}
      {endNote ? (
        <View style={[styles.endNote, { bottom: tabRoom + SPACE.s16 }]} pointerEvents="box-none">
          {isLoadingMore ? (
            <View style={styles.endNotePill} accessible accessibilityLabel="Loading more posts">
              <ActivityIndicator color={COLORS.white} />
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.endNotePill, pressed && { opacity: ALPHA.a70 }]}
              onPress={loadMore}
              accessibilityRole="button"
            >
              <Text style={styles.endNoteText}>Couldn’t load more. Tap to try again.</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {/* At the first post: "Switch to camera", under the header, the banner and the timer. */}
      {switchPill && onGoToCamera && posts.length > 0 ? (
        <SwitchCameraPill
          shown={switchPill.shown}
          morph={switchPill.morph}
          onPress={onGoToCamera}
          style={{ top: headerH + topInset + topSpace }}
        />
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
  // The open feed's timer: its own spot on the right (feedTimerSpot).
  timerSpot: {
    position: 'absolute',
  },
  // A locked feed: the lock pill floats in the middle of the frosted rows.
  lockBannerCentred: {
    bottom: 0,
    justifyContent: 'center',
  },
  skeleton: {
    justifyContent: 'flex-end',
  },
  lockedCard: {
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  moreLoader: {
    height: SIZE.z56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Full-screen posts: the list's own background is the posts' dark canvas.
  fullList: {
    backgroundColor: POST_FULL.canvas,
  },
  // Full-screen posts: "loading more" floats at the foot of the last post, under its caption.
  endNote: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  endNotePill: {
    minWidth: SIZE.z44,
    minHeight: SIZE.z44,
    paddingHorizontal: SPACE.s16,
    borderRadius: RADIUS.pill,
    backgroundColor: withAlpha(COLORS.black, ALPHA.a45),
    alignItems: 'center',
    justifyContent: 'center',
  },
  endNoteText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
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
