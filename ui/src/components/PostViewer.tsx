import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useProfilePosts } from '@/hooks/useProfilePosts';
import { TabBarRoomContext, useChromeFade } from '@/hooks/useChrome';
import { useAuthStore, useChromeStore, useFeedStore } from '@/store';
import PostCard from '@/components/PostCard';
import CommentSheet from '@/components/CommentSheet';
import GestureScrollView, { ListGestureContext } from '@/components/GestureScrollView';
import { backdropOpacity, openablePosts, viewerStartIndex } from '@/lib/viewer';
import {
  sidewaysCloses,
  sidewaysExit,
  sidewaysProgress,
  viewerPages,
  type ViewerFrom,
} from '@/lib/viewerSwipe';
import { feedListLayout, fullScreenPaging, snapBack } from '@/lib/feedListLayout';
import { shouldPlay } from '@/lib/videoPosts';
import type { MorphSource } from '@/lib/morph';
import type { FeedPost } from '@/api';
import { MorphingImage, useMorphTransition } from '@/components/MorphTransition';
import { GLYPH, TYPOGRAPHY } from '@/constants/typography';
import {
  COLORS,
  ALPHA,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  SWIPE,
  VIEWER,
  withAlpha,
} from '@/constants/tokens';

interface PostViewerProps {
  /** Whose posts: the profile the grid belongs to ('' with `from: 'feed'`). */
  userId: string;
  /**
   * Which list it pages through, up and down: a profile's posts, the feed, or just the one
   * `post` (a post shared in a chat: who can see it is the server's call, post by post).
   */
  from?: ViewerFrom;
  /** With `from: 'post'`: the post to show. */
  post?: FeedPost | null;
  /** The tapped post; null keeps the viewer closed. */
  postId: string | null;
  onClose: () => void;
  /** Someone else was tapped (a tagged friend): close and open their profile. */
  onOpenProfile: (userId: string) => void;
  /** Open with the start post's comments up (a comment notification). */
  openComments?: boolean;
  /** Measured grid tile used for the native shared-geometry transition. */
  source?: MorphSource | null;
}

/**
 * A profile's posts, full screen, starting on the tapped one (owner, 2026-10-02: like Instagram
 * and TikTok). Up and down pages through all of that profile's posts, one per screen with the
 * feed's snap, drawn exactly as the feed draws them (PostCard, videos included); a sideways swipe,
 * either way, closes it, as do the × and the back gesture (owner, 2026-10-10: "scroll up/down to
 * go between them and make swiping left or right be able to exit"; rules in
 * src/lib/viewerSwipe.ts). Only posts the grid lets you open are shown (the feed lock's rule).
 */
export default function PostViewer({
  userId,
  from = 'profile',
  post = null,
  postId,
  onClose,
  onOpenProfile,
  openComments = false,
  source = null,
}: PostViewerProps): React.JSX.Element {
  // Keep showing the last posts while the viewer fades out after `postId` goes null. Each opening
  // is a fresh viewer (new start post, back in place after a swipe closed the last one).
  const [openId, setOpenId] = useState<string | null>(null);
  const [shown, setShown] = useState<{
    postId: string;
    opening: number;
    source: MorphSource | null;
    post: FeedPost | null;
  } | null>(null);
  if (postId !== openId) {
    setOpenId(postId);
    if (postId) setShown({ postId, opening: (shown?.opening ?? 0) + 1, source, post });
  }

  if (!shown) return <></>;

  return (
    <PostViewerModal
      key={shown.opening}
      visible={!!postId}
      userId={userId}
      from={from}
      post={shown.post}
      startPostId={shown.postId}
      source={shown.source}
      onClose={onClose}
      onOpenProfile={onOpenProfile}
      openComments={openComments}
    />
  );
}

function PostViewerModal({
  visible,
  userId,
  from,
  post,
  startPostId,
  source,
  onClose,
  onOpenProfile,
  openComments,
}: {
  visible: boolean;
  userId: string;
  from: ViewerFrom;
  post: FeedPost | null;
  startPostId: string;
  source: MorphSource | null;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  openComments: boolean;
}): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const morph = useMorphTransition(source, onClose);

  return (
    <Modal
      visible={visible}
      animationType={morph.enabled ? 'none' : 'fade'}
      transparent
      statusBarTranslucent
      onRequestClose={morph.close}
    >
      {/* A Modal is its own native window: gesture-handler needs its own root here. */}
      <GestureHandlerRootView style={styles.root}>
        {/* No tab bar in here, even when opened from a tab. */}
        <TabBarRoomContext.Provider value={null}>
          <Reanimated.View
            style={[StyleSheet.absoluteFill, styles.backdrop, morph.backdropStyle]}
          />
          <Reanimated.View style={[styles.root, morph.contentStyle]}>
            <Pages
              from={from}
              post={post}
              userId={userId}
              startPostId={startPostId}
              open={visible && morph.presented}
              onClose={morph.close}
              onOpenProfile={onOpenProfile}
              commentsUp={openComments && morph.presented}
              morphProgress={morph.enabled ? morph.progress : undefined}
            />
          </Reanimated.View>
          {morph.enabled && source ? (
            <MorphingImage
              source={source}
              target={{ x: 0, y: 0, width, height }}
              targetRadius={0}
              progress={morph.progress}
            />
          ) : null}
        </TabBarRoomContext.Provider>
      </GestureHandlerRootView>
    </Modal>
  );
}

type PagesProps = {
  userId: string;
  startPostId: string;
  /** Still open (videos pause while it fades out). */
  open: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  /** Bring the start post's comments up (once, when this turns true). */
  commentsUp: boolean;
  /** When present, swipe-to-close directly scrubs the shared-geometry transition. */
  morphProgress?: SharedValue<number>;
};

/**
 * The list the viewer pages through: a profile's posts, the feed (owner, 2026-10-08), or the one
 * post shared in a chat (owner, 2026-10-10).
 */
function Pages({
  from,
  post,
  ...props
}: PagesProps & { from: ViewerFrom; post: FeedPost | null }): React.JSX.Element {
  const paged = viewerPages(from);
  if (from === 'post') return <OnePostPage {...props} post={post} paged={paged} />;
  return from === 'feed' ? (
    <FeedPages {...props} paged={paged} />
  ) : (
    <ProfilePages {...props} paged={paged} />
  );
}

/** Whether up and down moves between posts (viewerPages): not for one post on its own. */
type Paged = { paged: boolean };

const noMore = () => {};

/** Just the one post, as the chat's `get_messages` handed it over (nothing else is read). */
function OnePostPage({
  post,
  ...props
}: PagesProps & Paged & { post: FeedPost | null }): React.JSX.Element {
  const posts = useMemo(() => openablePosts(post ? [post] : []), [post]);
  return <ViewerPages {...props} posts={posts} hasMore={false} loadMore={noMore} />;
}

function ProfilePages(props: PagesProps & Paged): React.JSX.Element {
  const { posts: all, hasMore, loadMore } = useProfilePosts(props.userId);
  const posts = useMemo(() => openablePosts(all), [all]);
  return <ViewerPages {...props} posts={posts} hasMore={hasMore} loadMore={loadMore} />;
}

/** The feed, up and down like the feed itself; only posts it lets you open. */
function FeedPages(props: PagesProps & Paged): React.JSX.Element {
  const all = useFeedStore((s) => s.posts);
  const hasMore = useFeedStore((s) => s.hasMore);
  const posts = useMemo(() => openablePosts(all), [all]);
  const loadMore = useCallback(() => void useFeedStore.getState().loadMore(), []);
  return <ViewerPages {...props} posts={posts} hasMore={hasMore} loadMore={loadMore} />;
}

function ViewerPages({
  userId,
  startPostId,
  open,
  onClose,
  onOpenProfile,
  commentsUp,
  morphProgress,
  posts,
  hasMore,
  loadMore,
  paged,
}: PagesProps &
  Paged & {
    posts: ReturnType<typeof openablePosts<FeedPost>>;
    hasMore: boolean;
    loadMore: () => void;
  }): React.JSX.Element {
  const { dark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const myId = useAuthStore((s) => s.user?.id);
  // Holding a post (hold to view) fades the × away with everything else over the photo.
  const chrome = useChromeFade();
  // A photo being pinched holds the list and the close swipe still.
  const zooming = useChromeStore((s) => s.zooming);
  // One post per screen with the feed's snap: the post's height and the snap are the same
  // whole-pixel number, so no edge of the next post shows (src/lib/feedListLayout.ts).
  const { cardHeight, snapInterval } = useMemo(() => {
    const full = feedListLayout({
      rows: false,
      pageHeight: height,
      headerH: 0,
      topInset: 0,
      topSpace: 0,
      hasPosts: true,
      pixelRatio: PixelRatio.get(),
    });
    return { cardHeight: full.cardHeight ?? height, snapInterval: full.snapInterval };
  }, [height]);
  const paging = paged ? fullScreenPaging(snapInterval) : null;

  // Where it opens is decided once; later pages loading in don't move it.
  const [startIndex] = useState(() => viewerStartIndex(posts, startPostId));

  // Video posts: the post on screen plays (muted at first, one sound choice for the viewer).
  const [inViewId, setInViewId] = useState<string | null>(startPostId);
  const [muted, setMuted] = useState(true);
  const toggleMuted = useCallback(() => setMuted((m) => !m), []);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const commentsShown = useRef(false);
  useEffect(() => {
    if (!commentsUp || commentsShown.current) return;
    commentsShown.current = true;
    setCommentPostId(startPostId);
  }, [commentsUp, startPostId]);
  const extra = useMemo(
    () => ({ inViewId, muted, open, commenting: !!commentPostId }),
    [inViewId, muted, open, commentPostId]
  );

  // A quiet "Swipe for more" while the first post shown has another after it; gone after the
  // first swipe, so it's a hint, not a fixture.
  const [swiped, setSwiped] = useState(false);
  const moreHint = !swiped && (startIndex < posts.length - 1 || hasMore);

  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      const id = viewableItems[0]?.key ?? null;
      setInViewId(id);
      if (id && id !== startPostId) setSwiped(true);
    },
    [startPostId]
  );

  // A tap on the poster goes back to their profile (where the viewer came from); a tap on someone
  // else opens theirs. Your own name in someone's post does nothing, as in the feed.
  const onAvatarPress = useCallback(
    (id: string) => {
      if (id === userId) onClose();
      else if (id !== myId) onOpenProfile(id);
    },
    [userId, myId, onClose, onOpenProfile]
  );

  // ── Swipe sideways to close ──────────────────────────────────────────────
  // Up and down pages through the posts (the list's own scrolling). A clear sideways swipe, either
  // way, closes the viewer, the close animation following the finger: it starts once the finger
  // has moved SWIPE.slop sideways, and gives up if it moves that far up or down first, so
  // browsing and closing never compete for the same drag (rules: src/lib/viewerSwipe.ts).
  const list = useMemo(() => Gesture.Native(), []);
  const dx = useSharedValue(0);
  // How far the finger had already moved when the swipe took over: the post follows from there,
  // so it doesn't jump by that much as the swipe starts.
  const grabX = useSharedValue(0);
  // While the close swipe has the finger the list holds still, so the post doesn't drift up or
  // down under a sideways drag or page as it lets go.
  const [closing, setClosing] = useState(false);
  const swipe = Gesture.Pan()
    .enabled(!zooming)
    .maxPointers(1)
    .activeOffsetX([-SWIPE.slop, SWIPE.slop])
    .failOffsetY([-SWIPE.slop, SWIPE.slop])
    .simultaneousWithExternalGesture(list)
    .onStart((e) => {
      'worklet';
      grabX.value = e.translationX;
      scheduleOnRN(setClosing, true);
    })
    .onUpdate((e) => {
      'worklet';
      const moved = e.translationX - grabX.value;
      if (morphProgress) {
        // SharedValue supplied by the transition owner; the pan directly scrubs its UI-thread value.
        // eslint-disable-next-line react-hooks/immutability
        morphProgress.value = sidewaysProgress(moved, width);
      } else {
        dx.value = moved;
      }
    })
    .onEnd((e) => {
      'worklet';
      if (sidewaysCloses(e.translationX, e.velocityX)) {
        if (morphProgress) scheduleOnRN(onClose);
        else {
          dx.value = withTiming(
            sidewaysExit(e.translationX, width),
            { duration: VIEWER.closeMs },
            (done) => {
              if (done) scheduleOnRN(onClose);
            }
          );
        }
      } else {
        if (morphProgress) {
          // eslint-disable-next-line react-hooks/immutability
          morphProgress.value = withSpring(1, VIEWER.snapBack);
        } else dx.value = withSpring(0, VIEWER.snapBack);
      }
    })
    .onFinalize(() => {
      'worklet';
      scheduleOnRN(setClosing, false);
    });

  const pagesStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity(dx.value) }));

  // A list left a little off its post goes straight back to it. Two fingers starting a pinch, or
  // a finger starting the close swipe, can drag the list a few points before it is held still.
  const listRef = useRef<FlashListRef<FeedPost>>(null);
  const lastY = useRef<number | null>(null);
  const postCount = useRef(posts.length);
  useEffect(() => {
    postCount.current = posts.length;
  }, [posts.length]);
  const held = zooming || closing;
  useEffect(() => {
    if (lastY.current == null) return;
    const rest = snapBack(lastY.current, paged ? snapInterval : undefined, postCount.current);
    if (rest != null) listRef.current?.scrollToOffset({ offset: rest, animated: false });
  }, [held, paged, snapInterval]);

  return (
    <View
      style={styles.root}
      accessibilityViewIsModal
      // VoiceOver's "escape" (two-finger scrub) closes it too.
      onAccessibilityEscape={onClose}
    >
      <Reanimated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <GestureDetector gesture={swipe}>
        <Reanimated.View style={[styles.root, pagesStyle]}>
          <ListGestureContext.Provider value={list}>
            <FlashList
              ref={listRef}
              // One post on its own doesn't move up or down at all.
              scrollEnabled={paged && !held}
              bounces={paged}
              overScrollMode={paged ? 'auto' : 'never'}
              renderScrollComponent={GestureScrollView}
              data={posts}
              keyExtractor={(item) => item.id}
              extraData={extra}
              initialScrollIndex={startIndex}
              renderItem={({ item }) => (
                <PostCard
                  item={item}
                  dark={dark}
                  width={width}
                  height={cardHeight}
                  onAvatarPress={onAvatarPress}
                  onCommentPress={setCommentPostId}
                  playing={shouldPlay({
                    screenActive: open && !commentPostId,
                    inView: inViewId === item.id,
                  })}
                  soundOff={muted}
                  onToggleMuted={toggleMuted}
                />
              )}
              {...paging}
              showsVerticalScrollIndicator={false}
              onScroll={(e) => {
                lastY.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              onEndReached={hasMore ? loadMore : undefined}
              onEndReachedThreshold={0.4}
              onViewableItemsChanged={onViewable}
              viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
            />
          </ListGestureContext.Provider>
        </Reanimated.View>
      </GestureDetector>

      {/* Close — top-left, in the room each post keeps above its tags */}
      <Reanimated.View
        style={[styles.closeWrap, { top: insets.top }, chrome.style]}
        pointerEvents={chrome.viewing ? 'none' : 'box-none'}
      >
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: ALPHA.a20 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <Text style={styles.closeX}>×</Text>
        </Pressable>
      </Reanimated.View>

      {moreHint ? (
        <Reanimated.View
          style={[styles.moreWrap, { top: insets.top }, chrome.style]}
          pointerEvents="none"
        >
          <Text style={styles.moreText}>Swipe for more</Text>
        </Reanimated.View>
      ) : null}

      {/* Comments — the same native page sheet as the feed's */}
      <CommentSheet postId={commentPostId} dark={dark} onClose={() => setCommentPostId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: COLORS.black,
  },
  closeWrap: {
    position: 'absolute',
    left: OFFSET.o16,
  },
  closeBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    backgroundColor: withAlpha(COLORS.black, ALPHA.a40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreWrap: {
    position: 'absolute',
    right: OFFSET.o16,
    minHeight: SIZE.z36,
    justifyContent: 'center',
    paddingHorizontal: SPACE.s14,
    borderRadius: RADIUS.r18,
    backgroundColor: withAlpha(COLORS.black, ALPHA.a40),
  },
  moreText: {
    ...TYPOGRAPHY.captionStrong,
    color: COLORS.white,
  },
  closeX: {
    ...GLYPH.icon,
    color: COLORS.white,
  },
});
