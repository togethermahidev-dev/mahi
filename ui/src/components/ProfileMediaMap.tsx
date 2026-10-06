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
import { FlashList, useRecyclingState } from '@shopify/flash-list';
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
import type { FeedPost } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
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

const GAP = SPACE.s2;

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

function GridCell({
  post,
  dark,
  size,
  column,
  onPress,
  menuOn,
}: {
  post: FeedPost;
  dark: boolean;
  size: number;
  column: number;
  onPress: () => void;
  /** Hold to preview (flag context-menu-preview, iPhone, build 11). */
  menuOn: boolean;
}) {
  // FlashList reuses cells: forget a previous post's failed image when the post changes.
  const [imgError, setImgError] = useRecyclingState(false, [post.id]);
  // A muted square with a spinner until the photo arrives (slow networks).
  const [imgLoaded, setImgLoaded] = useRecyclingState(false, [post.id]);
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
  // FlashList gives each column an equal third of the width; nudging each cell right by a
  // share of the gap keeps the photos equal with GAP between them.
  const place = { marginLeft: (column * GAP) / LAYOUT.profileColumns };

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
        // With the pop-up, its host carries the spacing instead.
        !withMenu && styles.cell,
        { width: size, height: size },
        !withMenu && place,
        pressed && { opacity: ALPHA.a80 },
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
        <View style={[styles.lockedTile, { width: size, height: size, backgroundColor: tileBg }]}>
          <LockIcon color={muted} />
        </View>
      ) : tile.video && !tile.uri ? (
        <View style={[styles.videoTile, { width: size, height: size }]}>
          <VideoIcon size={ICON_SIZE.i32} color={COLORS.white} />
        </View>
      ) : imgError || !tile.uri ? (
        // A photo that failed to load: a plain square with the camera mark, never a stand-in photo.
        <View style={[styles.lockedTile, { width: size, height: size, backgroundColor: tileBg }]}>
          <CameraIcon color={muted} size={ICON_SIZE.i32} />
        </View>
      ) : (
        <View style={{ width: size, height: size, backgroundColor: tileBg }}>
          <Image
            source={{ uri: tile.uri }}
            style={{ width: size, height: size }}
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
      width={size}
      height={size}
      style={[styles.cell, place]}
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

/** A profile page as one scrolling list: the header, then the posts three to a row. */
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
  const storeUserId = useProfilePostsStore((s) => s.userId);
  const isSyncing = useProfilePostsStore((s) => s.isSyncing);
  const lastSyncedAt = useProfilePostsStore((s) => s.lastSyncedAt);
  // Until this screen's first read has started, a leftover failed read isn't shown as an error.
  const [started, setStarted] = useState(false);
  if (isSyncing && !started) setStarted(true);
  const isLoading = posts.length === 0 && (!started || isSyncing || storeUserId !== userId);
  const failed = posts.length === 0 && !isLoading && lastSyncedAt === null;
  const menuOn = useContextMenuPreview();
  const { width } = useWindowDimensions();
  const cellSize = (width - GAP * (LAYOUT.profileColumns - 1)) / LAYOUT.profileColumns;

  // Pull to refresh: the spinner shows until the fresh posts are in.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const empty = isLoading ? (
    <ListState kind="loading" dark={dark} />
  ) : failed ? (
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
          ? 'Your first post needs no tag. Any workout counts.'
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
        renderScrollComponent={GestureScrollView}
        data={posts}
        keyExtractor={(item) => item.id}
        numColumns={LAYOUT.profileColumns}
        style={{ ...styles.list, backgroundColor: bg }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={tabRoom > 0 ? { paddingBottom: tabRoom } : undefined}
        renderItem={({ item, index }) => (
          <GridCell
            post={item}
            dark={dark}
            size={cellSize}
            column={index % LAYOUT.profileColumns}
            // Locked posts (no photo URL) never reach here: their square explains itself.
            onPress={() => onPostPress?.(item)}
            menuOn={menuOn}
          />
        )}
        showsVerticalScrollIndicator={false}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} {...refreshTint(dark)} />
        }
      />
    </ListGestureContext.Provider>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  cell: {
    marginBottom: GAP,
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
