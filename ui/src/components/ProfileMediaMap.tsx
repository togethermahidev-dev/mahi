import React, { useState } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTabBarRoom } from '@/hooks/useChrome';
import type { NativeGesture } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { refreshTint } from '@/lib/themeColors';
import { useProfilePosts } from '@/hooks/useProfilePosts';
import { pointsBadgeText } from '@/lib/mahiPoints';
import { gridTile } from '@/lib/videoPosts';
import {
  gridMenuItems,
  isMenuAction,
  menuA11yActions,
  previewSize,
  shareTarget,
} from '@/lib/contextMenuPreview';
import { sharePost } from '@/lib/sharePost';
import { useContextMenuPreview } from '@/hooks/useContextMenuPreview';
import { useProfilePostsStore, useSocialStore, useUserStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { VideoIcon } from '@/components/ScreenIcons';
import PreviewMenu, { PostPreviewImage } from '@/components/PreviewMenu';
import GestureScrollView, { ListGestureContext } from '@/components/GestureScrollView';
import ListState from '@/components/ListState';
import { restrictedText } from '@/lib/accountControls';
import type { FeedPost } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  ICON_SIZE,
  LAYOUT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  STROKE,
  withAlpha,
} from '@/constants/tokens';

function CameraIcon({ color, size = SIZE.z48 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M24 30a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"
        stroke={color}
        strokeWidth={STROKE.s2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 18a4 4 0 0 1 4-4h2l3-4h18l3 4h2a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V18z"
        stroke={color}
        strokeWidth={STROKE.s2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A padlock, drawn like CameraIcon: the square for a post that opens once you answer a tag. */
function LockIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE.i22} height={ICON_SIZE.i22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke={color}
        strokeWidth={STROKE.s2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7z"
        stroke={color}
        strokeWidth={STROKE.s2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Said when a locked square is tapped, and read by VoiceOver on it. */
const LOCKED_HINT = 'Opens when you answer a friend’s tag.';

function WorkoutCard({
  post,
  dark,
  width,
  mediaHeight,
  onPress,
  menuOn,
}: {
  post: FeedPost;
  dark: boolean;
  width: number;
  mediaHeight: number;
  onPress: () => void;
  /** Hold to preview (standard, no switch; iPhone, build 11). */
  menuOn: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  // A muted square with a spinner until the photo arrives (slow networks).
  const [imgLoaded, setImgLoaded] = useState(false);
  const badgeBg = dark
    ? withAlpha(COLORS.offBlack, ALPHA.a75)
    : withAlpha(COLORS.offWhite, ALPHA.a75);
  const badgeText = dark ? COLORS.offWhite : COLORS.offBlack;
  const points = pointsBadgeText(post.streak_day);
  // Video posts: show the post's still photo (or a video card) and mark it with a video icon.
  const tile = gridTile(post);
  const label = tile.video ? 'video post' : 'post';
  // Locked: the server sent no photo (the viewer hasn't answered a tag lately).
  const locked = !post.image_url;
  const { muted } = themeColors(dark);
  // Locked, loading and failed squares share one muted surface.
  const tileBg = dark ? COLORS.surfaceDark : COLORS.surfaceLight2;
  // Hold to preview: only posts that open (locked ones have no photo) get the pop-up.
  const withMenu = menuOn && !!post.image_url;
  const liked = useSocialStore((s) => s.likedByMe[post.id] ?? post.liked_by_me);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const items = withMenu ? gridMenuItems({ liked, canShare: shareTarget(post) != null }) : [];
  const runAction = (action: string) => {
    if (!isMenuAction(action)) return;
    if (action === 'open') onPress();
    else if (action === 'like' || action === 'unlike') {
      const userId = useUserStore.getState().profile?.id;
      if (!userId) return;
      // Seed the post's liked state first, so the toggle starts from what the grid shows.
      useSocialStore.getState().initPost(post.id, post.liked_by_me);
      useSocialStore.getState().toggleLike(post.id, userId);
    } else if (action === 'share') sharePost(post);
  };

  const cell = (
    <Pressable
      style={({ pressed }) => [
        styles.gridCard,
        { width, backgroundColor: tileBg },
        pressed && styles.pressed,
      ]}
      onPress={locked ? () => useToastStore.getState().show(LOCKED_HINT) : onPress}
      accessibilityRole="button"
      accessibilityLabel={
        locked
          ? `Locked post. ${LOCKED_HINT}`
          : imgError
            ? 'Couldn’t load this post'
            : `${label.charAt(0).toUpperCase() + label.slice(1)}${points ? `, ${points}` : ''}`
      }
      // VoiceOver: the menu's choices as actions (a double tap already opens the post).
      accessibilityActions={withMenu ? menuA11yActions(items, ['open']) : undefined}
      onAccessibilityAction={withMenu ? (e) => runAction(e.nativeEvent.actionName) : undefined}
    >
      {locked ? (
        <View style={[styles.lockedTile, { width, height: mediaHeight, backgroundColor: tileBg }]}>
          <LockIcon color={muted} />
        </View>
      ) : tile.video && !tile.uri ? (
        <View style={[styles.videoTile, { width, height: mediaHeight }]}>
          <VideoIcon size={ICON_SIZE.i32} color={COLORS.white} />
        </View>
      ) : imgError || !tile.uri ? (
        // A photo that failed to load: a plain square with the camera mark, never a stand-in photo.
        <View style={[styles.lockedTile, { width, height: mediaHeight, backgroundColor: tileBg }]}>
          <CameraIcon color={muted} size={ICON_SIZE.i32} />
        </View>
      ) : (
        <View style={{ width, height: mediaHeight, backgroundColor: tileBg }}>
          <Image
            source={{ uri: tile.uri, cache: 'force-cache' }}
            style={{ width, height: mediaHeight }}
            resizeMode="cover"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
          {imgLoaded ? null : (
            <View style={[StyleSheet.absoluteFill, styles.lockedTile]} pointerEvents="none">
              <ActivityIndicator color={muted} />
            </View>
          )}
        </View>
      )}
      {tile.video ? (
        <View style={[styles.videoBadge, { backgroundColor: badgeBg }]}>
          <VideoIcon size={ICON_SIZE.i16} color={badgeText} />
        </View>
      ) : null}
      {points ? (
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: badgeText }]}>{points}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  if (!withMenu) return cell;
  return (
    <PreviewMenu
      width={width}
      height={mediaHeight}
      style={styles.gridCard}
      dark={dark}
      items={items}
      onAction={runAction}
      previewSize={previewSize({ width: screenW, height: screenH }, 'post')}
      previewBackground={dark ? COLORS.surfaceDark2 : COLORS.surfaceLight}
      renderPreview={() => <PostPreviewImage uri={tile.uri} />}
    >
      {cell}
    </PreviewMenu>
  );
}

interface ProfileMediaMapProps {
  userId: string;
  isSelf: boolean;
  /**
   * Everything above the grid (avatar, name, stats, buttons, suggestions). The whole profile is
   * one list: this scrolls away with the grid, so the grid can fill the screen.
   */
  header: React.ReactElement;
  onPostPress?: (post: FeedPost) => void;
  /** The list's scrolling as a gesture, so a page swipe around it can run alongside it. */
  listGesture?: NativeGesture;
  /** Someone else's @username, for their empty grid ("@sam hasn't posted yet."). */
  username?: string | null;
  /** Your own empty grid: a button to the camera, when the screen can open it. */
  onOpenCamera?: () => void;
}

/** A profile page as one scrolling list: the header, then a calm, two-column workout grid. */
export default function ProfileMediaMap({
  userId,
  isSelf,
  header,
  onPostPress,
  listGesture,
  username,
  onOpenCamera,
}: ProfileMediaMapProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  // The last row scrolls clear of the phone's tab bar.
  const tabRoom = useTabBarRoom();
  const { muted } = themeColors(dark);

  const { posts, hasMore, loadMore, refresh } = useProfilePosts(userId);
  // Loading, failed and empty are three states. The store keeps the last good read's time, so:
  // nothing read yet for this person → loading; a read that ended without one → failed.
  // Deleting every post never gives the first workout back (the server's permanent mark).
  const postedBefore = useUserStore((s) => s.profile?.has_posted_before === true);
  const storeUserId = useProfilePostsStore((s) => s.userId);
  const isSyncing = useProfilePostsStore((s) => s.isSyncing);
  const lastSyncedAt = useProfilePostsStore((s) => s.lastSyncedAt);
  // Someone's Controls hide their workouts from you: say why, no grid (private accounts).
  const restricted = useProfilePostsStore((s) => (s.userId === userId ? s.restricted : null));
  // Until this screen's first read has started, a leftover failed read isn't shown as an error.
  const [started, setStarted] = useState(false);
  if (isSyncing && !started) setStarted(true);
  const isLoading = posts.length === 0 && (!started || isSyncing || storeUserId !== userId);
  const failed = posts.length === 0 && !isLoading && lastSyncedAt === null;
  const menuOn = useContextMenuPreview();
  const { width } = useWindowDimensions();
  const cardWidth = (width - SPACE.s1 * (LAYOUT.profileColumns + 1)) / LAYOUT.profileColumns;
  // Square photos with hairline gaps; the hold-to-preview wrapper is exactly the photo's size.
  const mediaHeight = cardWidth;

  // Pull to refresh: the spinner shows until the fresh posts are in.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const empty = isLoading ? (
    <ListState kind="loading" dark={dark} />
  ) : restricted && !isSelf ? null : failed ? (
    <ListState
      kind="error"
      dark={dark}
      title="Couldn’t load posts"
      onAction={() => void refresh()}
    />
  ) : (
    <ListState
      kind="empty"
      dark={dark}
      title={isSelf ? 'Your posts show up here' : 'No posts yet'}
      line={
        isSelf
          ? postedBefore
            ? 'You post when a friend tags you. Any workout counts.'
            : 'Show up with your first workout to earn your first point.'
          : username
            ? `@${username} hasn’t posted yet.`
            : 'Nothing posted yet.'
      }
      actionLabel={isSelf && onOpenCamera ? 'Open camera' : undefined}
      onAction={isSelf ? onOpenCamera : undefined}
      icon={<CameraIcon color={muted} size={ICON_SIZE.i24} />}
    />
  );

  return (
    <ListGestureContext.Provider value={listGesture}>
      <FlashList
        style={{ ...styles.list, backgroundColor: bg }}
        renderScrollComponent={GestureScrollView}
        contentContainerStyle={{ ...styles.content, paddingBottom: tabRoom || undefined }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} {...refreshTint(dark)} />
        }
        data={posts}
        keyExtractor={(post) => post.id}
        numColumns={LAYOUT.profileColumns}
        ListHeaderComponent={
          restricted && !isSelf ? (
            <>
              {header}
              {/* Always on top when their Controls hide their workouts: any posts below are
                  ones you're tagged on (owner, 2026-10-08). */}
              <ListState
                kind="empty"
                dark={dark}
                title={restrictedText(restricted, username ?? '')}
                icon={<LockIcon color={muted} />}
              />
            </>
          ) : (
            header
          )
        }
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <View style={styles.gridCell}>
            <WorkoutCard
              post={item}
              dark={dark}
              width={cardWidth}
              mediaHeight={mediaHeight}
              onPress={() => onPostPress?.(item)}
              menuOn={menuOn}
            />
          </View>
        )}
        onEndReached={hasMore ? () => void loadMore() : undefined}
        onEndReachedThreshold={LAYOUT.profileEndThreshold}
        ListFooterComponent={
          isSyncing && posts.length > 0 ? (
            <View style={styles.moreLoader} accessibilityLabel="Loading more workouts">
              <ActivityIndicator color={muted} />
            </View>
          ) : null
        }
      />
    </ListGestureContext.Provider>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  gridCell: {
    marginLeft: SPACE.s1,
    marginBottom: SPACE.s1,
  },
  moreLoader: {
    height: SIZE.z48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCard: {
    overflow: 'hidden',
  },
  pressed: {
    opacity: ALPHA.a80,
  },
  badge: {
    position: 'absolute',
    bottom: OFFSET.o4,
    right: OFFSET.o4,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s2,
    paddingHorizontal: SPACE.s6,
  },
  badgeText: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.semiBold,
  },
  // A locked or failed post: a plain square with a padlock or the camera mark (never a stand-in
  // photo); also centres the spinner while a photo loads.
  lockedTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Video posts: a square with no still photo, and the small video mark top right.
  videoTile: {
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    top: OFFSET.o4,
    right: OFFSET.o4,
    borderRadius: RADIUS.r50,
    padding: SPACE.s2,
  },
});
