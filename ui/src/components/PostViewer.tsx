import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
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
import { useAuthStore, useChromeStore } from '@/store';
import PostCard from '@/components/PostCard';
import CommentSheet from '@/components/CommentSheet';
import GestureScrollView, { ListGestureContext } from '@/components/GestureScrollView';
import { backdropOpacity, openablePosts, swipeCloses, viewerStartIndex } from '@/lib/viewer';
import { shouldPlay } from '@/lib/videoPosts';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  FONT_SIZE,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  SWIPE,
  VIEWER,
  withAlpha,
} from '@/constants/tokens';

interface PostViewerProps {
  /** Whose posts: the profile the grid belongs to. */
  userId: string;
  /** The tapped post; null keeps the viewer closed. */
  postId: string | null;
  onClose: () => void;
  /** Someone else was tapped (a tagged friend): close and open their profile. */
  onOpenProfile: (userId: string) => void;
  /** Open with the start post's comments up (a comment notification). */
  openComments?: boolean;
}

/**
 * A profile's posts, full screen, starting on the tapped one (owner, 2026-10-02: like Instagram
 * and TikTok). Left/right pages through all of that profile's posts, one per screen, drawn exactly
 * as the feed draws them (PostCard, videos included); a swipe down closes it, as do the ✕ and the
 * back gesture. Only posts the grid lets you open are shown (the feed lock's rule).
 */
export default function PostViewer({
  userId,
  postId,
  onClose,
  onOpenProfile,
  openComments = false,
}: PostViewerProps): React.JSX.Element {
  // Keep showing the last posts while the viewer fades out after `postId` goes null. Each opening
  // is a fresh viewer (new start post, back in place after a swipe closed the last one).
  const [openId, setOpenId] = useState<string | null>(null);
  const [shown, setShown] = useState<{ postId: string; opening: number } | null>(null);
  if (postId !== openId) {
    setOpenId(postId);
    if (postId) setShown({ postId, opening: (shown?.opening ?? 0) + 1 });
  }
  // Which opening has finished appearing: the comment sheet can only slide up over it after that.
  const [presented, setPresented] = useState(0);

  return (
    <Modal
      visible={!!postId}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={() => setPresented(shown?.opening ?? 0)}
    >
      {/* A Modal is its own native window: gesture-handler needs its own root here. */}
      <GestureHandlerRootView style={styles.root}>
        {/* No tab bar in here, even when opened from a tab. */}
        <TabBarRoomContext.Provider value={null}>
          {shown ? (
            <ViewerPages
              key={shown.opening}
              userId={userId}
              startPostId={shown.postId}
              open={!!postId}
              onClose={onClose}
              onOpenProfile={onOpenProfile}
              commentsUp={openComments && presented === shown.opening}
            />
          ) : null}
        </TabBarRoomContext.Provider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ViewerPages({
  userId,
  startPostId,
  open,
  onClose,
  onOpenProfile,
  commentsUp,
}: {
  userId: string;
  startPostId: string;
  /** Still open (videos pause while it fades out). */
  open: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  /** Bring the start post's comments up (once, when this turns true). */
  commentsUp: boolean;
}): React.JSX.Element {
  const { dark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const myId = useAuthStore((s) => s.user?.id);
  // Holding a post (hold to view) fades the ✕ away with everything else over the photo.
  const chrome = useChromeFade();
  // A photo being pinched holds the list and the close swipe still.
  const zooming = useChromeStore((s) => s.zooming);

  const { posts: all, hasMore, loadMore } = useProfilePosts(userId);
  const posts = useMemo(() => openablePosts(all), [all]);
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

  // ── Swipe down to close ──────────────────────────────────────────────────
  // Horizontal swipes page through workouts. A deliberate vertical pull dismisses the viewer,
  // so browsing and closing never compete for the same shared gesture value.
  const list = useMemo(() => Gesture.Native(), []);
  const dy = useSharedValue(0);
  const swipe = Gesture.Pan()
    .enabled(!zooming)
    .maxPointers(1)
    .activeOffsetY([SWIPE.slop, SWIPE.slop])
    .failOffsetX([-SWIPE.slop, SWIPE.slop])
    .simultaneousWithExternalGesture(list)
    .onUpdate((e) => {
      'worklet';
      dy.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      'worklet';
      if (swipeCloses(e.translationY, e.velocityY)) {
        dy.value = withTiming(height, { duration: VIEWER.closeMs }, (done) => {
          if (done) scheduleOnRN(onClose);
        });
      } else {
        dy.value = withSpring(0, VIEWER.snapBack);
      }
    });

  const pagesStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dy.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity(dy.value) }));

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
              scrollEnabled={!zooming}
              renderScrollComponent={GestureScrollView}
              data={posts}
              keyExtractor={(item) => item.id}
              extraData={extra}
              initialScrollIndex={startIndex}
              horizontal
              renderItem={({ item }) => (
                <PostCard
                  item={item}
                  dark={dark}
                  width={width}
                  height={height}
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
              snapToInterval={width}
              snapToAlignment="start"
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
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
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
  closeX: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
    lineHeight: LINE_HEIGHT.l18,
    color: COLORS.white,
  },
});
