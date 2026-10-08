/**
 * One post as a feed row (owner, 2026-10-08): the size of a Messages row. Who posted, the caption
 * or time, likes and comments, and small previews of both shots in the same line. Tapping grows
 * the rear shot into the full-screen TikTok view through the shared morph; holding pops the row
 * out with Apple's menu (Open, Like, Comment, Share, View profile).
 *
 * Rows sit on Mahi blue, which shows through the gap between rows as the divider. While your
 * feed is locked the server sends no photo or caption; the row is then a stand-in (no name, no
 * face) under heavy frost, so nothing can be read until the feed opens. The one lock pill with
 * what to do sits over the feed (FeedLockBanner), not on each row.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore, useFeedStore, useSocialStore } from '@/store';
import { HeartIcon, CommentIcon } from '@/components/ScreenIcons';
import { PressScale } from '@/components/Motion';
import PreviewMenu, { PostPreviewImage } from '@/components/PreviewMenu';
import { useContextMenuPreview } from '@/hooks/useContextMenuPreview';
import {
  isMenuAction,
  menuA11yActions,
  previewSize,
  rowMenuItems,
  shareTarget,
} from '@/lib/contextMenuPreview';
import { sharePost } from '@/lib/sharePost';
import { gridTile } from '@/lib/videoPosts';
import { relativeTime } from '@/lib/relativeTime';
import { haptic } from '@/lib/haptics';
import type { MorphSource } from '@/lib/morph';
import type { FeedPost } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  COLORS,
  FONT_SIZE,
  ICON_SIZE,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/**
 * A locked row: the real row under full frost, like the camera's cover over the live camera
 * (owner, 2026-10-08). The person's photo and name are there (the server sends who posted) but
 * frosted to a smudge; the previews are blank, since the server sends no photo or caption. Nothing
 * can be read, and VoiceOver says only "Locked post".
 */
function LockedRow({ item }: { item: FeedPost }): React.JSX.Element {
  const { dark, colors } = useAppTheme();
  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();
  return (
    <View
      style={[styles.row, { backgroundColor: colors.bg }]}
      accessible
      accessibilityLabel="Locked post"
      importantForAccessibility="yes"
    >
      {item.profiles.avatar_url ? (
        <Image
          source={{ uri: item.profiles.avatar_url, cache: 'force-cache' }}
          style={styles.avatar}
          accessibilityElementsHidden
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { borderColor: colors.text }]}>
          <Text style={[styles.avatarInitial, { color: colors.text }]}>{initials}</Text>
        </View>
      )}
      <View style={styles.words} accessibilityElementsHidden>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.line, { color: colors.muted }]} numberOfLines={1}>
          {relativeTime(item.created_at)}
        </Text>
      </View>
      <View style={styles.thumbs}>
        <View style={[styles.thumb, { backgroundColor: colors.border }]} />
        <View style={[styles.thumb, { backgroundColor: colors.border }]} />
      </View>
      <BlurView
        intensity={BLUR_INTENSITY.i100}
        tint={dark ? 'dark' : 'light'}
        style={[StyleSheet.absoluteFill, styles.frost]}
        pointerEvents="none"
      />
    </View>
  );
}

export default function FeedRow({
  item,
  width,
  onOpen,
  onAvatarPress,
  onCommentPress,
}: {
  item: FeedPost;
  width: number;
  /** Open the full-screen view from this row's rear shot (its measured place, for the morph). */
  onOpen: (postId: string, source: MorphSource | null) => void;
  onAvatarPress: (userId: string) => void;
  onCommentPress: (postId: string) => void;
}): React.JSX.Element {
  const { dark, colors } = useAppTheme();
  const currentUser = useAuthStore((s) => s.user);
  const tile = gridTile(item);
  const rearRef = useRef<View>(null);

  // Likes and counts move with the feed's copy of the post, the same as the full-screen card.
  const likedByMe = useSocialStore((s) => s.likedByMe[item.id] ?? item.liked_by_me);
  const counts = useFeedStore((s) => s.posts.find((p) => p.id === item.id));
  const likeCount = counts?.like_count ?? item.like_count;
  const commentCount = counts?.comment_count ?? item.comment_count;
  useEffect(() => {
    if (!item.locked) useSocialStore.getState().initPost(item.id, item.liked_by_me);
  }, [item.id, item.liked_by_me, item.locked]);

  // Hold to preview: only a row that opens gets the pop-up.
  const menuOn = useContextMenuPreview();
  const withMenu = menuOn && !item.locked && !!tile.uri;
  const { width: screenW, height: screenH } = useWindowDimensions();
  const items = withMenu
    ? rowMenuItems({ liked: likedByMe, canShare: shareTarget(item) != null })
    : [];

  const open = useCallback(() => {
    const uri = tile.uri;
    if (!uri) {
      onOpen(item.id, null);
      return;
    }
    rearRef.current?.measureInWindow((x, y, w, h) => {
      onOpen(item.id, { x, y, width: w, height: h, uri, borderRadius: RADIUS.r10 });
    });
  }, [item.id, tile.uri, onOpen]);

  const like = useCallback(() => {
    if (!currentUser) return;
    haptic('tick');
    void useSocialStore.getState().toggleLike(item.id, currentUser.id);
  }, [currentUser, item.id]);
  const runAction = (action: string) => {
    if (!isMenuAction(action)) return;
    if (action === 'open') open();
    else if (action === 'like' || action === 'unlike') like();
    else if (action === 'comment') onCommentPress(item.id);
    else if (action === 'share') void sharePost(item);
    else if (action === 'view-profile') onAvatarPress(item.profiles.id);
  };

  if (item.locked) return <LockedRow item={item} />;

  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();
  const line = item.caption?.trim() || relativeTime(item.created_at);
  // The rear shot first (it opens), the selfie beside it.
  const second = tile.uri === item.image_url ? item.pov_image_url : item.image_url;

  const row = (
    <PressScale
      style={[styles.row, { backgroundColor: colors.bg }]}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${name}'s post. ${line}. ${likeCount} likes, ${commentCount} comments`}
      accessibilityHint="Opens it full screen"
      // VoiceOver: the menu's choices as actions (a double tap already opens the post).
      accessibilityActions={withMenu ? menuA11yActions(items, ['open']) : undefined}
      onAccessibilityAction={withMenu ? (e) => runAction(e.nativeEvent.actionName) : undefined}
    >
      <Pressable
        onPress={() => onAvatarPress(item.profiles.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s profile`}
        hitSlop={OFFSET.o8}
      >
        {item.profiles.avatar_url ? (
          <Image
            source={{ uri: item.profiles.avatar_url, cache: 'force-cache' }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { borderColor: colors.text }]}>
            <Text style={[styles.avatarInitial, { color: colors.text }]}>{initials}</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.words}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.line, { color: colors.muted }]} numberOfLines={1}>
          {line}
        </Text>
        <View style={styles.counts}>
          <Pressable
            style={({ pressed }) => [styles.count, pressed && { opacity: ALPHA.a75 }]}
            onPress={like}
            accessibilityRole="button"
            accessibilityLabel={`Like, ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
            accessibilityState={{ selected: likedByMe }}
            hitSlop={OFFSET.o8}
          >
            <HeartIcon size={ICON_SIZE.i16} color={colors.text} filled={likedByMe} />
            <Text style={[styles.countText, { color: colors.text }]}>{likeCount}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.count, pressed && { opacity: ALPHA.a75 }]}
            onPress={() => onCommentPress(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Comments, ${commentCount}`}
            hitSlop={OFFSET.o8}
          >
            <CommentIcon size={ICON_SIZE.i16} color={colors.text} />
            <Text style={[styles.countText, { color: colors.text }]}>{commentCount}</Text>
          </Pressable>
        </View>
      </View>

      {/* Both shots, small, in the same line. */}
      <View style={styles.thumbs}>
        <View
          ref={rearRef}
          collapsable={false}
          style={[styles.thumb, { backgroundColor: colors.border }]}
        >
          {tile.uri ? (
            <Image
              source={{ uri: tile.uri, cache: 'force-cache' }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : null}
        </View>
        <View style={[styles.thumb, { backgroundColor: colors.border }]}>
          {second ? (
            <Image
              source={{ uri: second, cache: 'force-cache' }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : null}
        </View>
      </View>
    </PressScale>
  );

  if (!withMenu) return row;
  return (
    <PreviewMenu
      width={width}
      dark={dark}
      items={items}
      onAction={runAction}
      previewSize={previewSize({ width: screenW, height: screenH }, 'post')}
      previewBackground={colors.bg}
      renderPreview={() => <PostPreviewImage uri={tile.uri} />}
    >
      {row}
    </PreviewMenu>
  );
}

const styles = StyleSheet.create({
  // The Messages row's size and spacing.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s14,
    gap: SPACE.s12,
    overflow: 'hidden',
  },
  avatar: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER_WIDTH.w1,
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
  },
  words: {
    flex: 1,
    gap: SPACE.s3,
  },
  name: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.bold,
  },
  line: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
  },
  counts: {
    flexDirection: 'row',
    gap: SPACE.s12,
    marginTop: SPACE.s3,
  },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s4,
  },
  countText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
  },
  thumbs: {
    flexDirection: 'row',
    gap: SPACE.s6,
  },
  // A small 3:4 preview of each shot.
  thumb: {
    width: SIZE.z42,
    height: SIZE.z56,
    borderRadius: RADIUS.r10,
    overflow: 'hidden',
  },
  frost: {
    backgroundColor: withAlpha(COLORS.accent, ALPHA.a20),
  },
});
