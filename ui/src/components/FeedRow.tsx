/**
 * One post as a feed row (owner, 2026-10-08: the feed is rows, like Facebook; tapping a row grows
 * it into the full-screen TikTok view through the shared morph). Who posted, a square with both
 * photos (the rear shot, the selfie inset), the caption, likes and comments.
 *
 * Rows sit on Mahi blue, which shows through the gap between rows as the divider. A locked row
 * (the server sends no photo while your feed is locked) is frosted with a small padlock pill, so
 * a locked feed still looks like a feed.
 *
 * Hold the square and it pops out with Apple's menu (Open, Like, Comment, Share, View profile),
 * as a profile grid square does; Open morphs it into the full-screen feed.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
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
  LINE_HEIGHT,
  RADIUS,
  SIZE,
  SPACE,
  STROKE,
  withAlpha,
} from '@/constants/tokens';

/** A padlock, as on the profile grid's locked squares. */
function LockIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE.i16} height={ICON_SIZE.i16} viewBox="0 0 24 24" fill="none">
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

export default function FeedRow({
  item,
  width,
  lockedHint,
  onOpen,
  onAvatarPress,
  onCommentPress,
}: {
  item: FeedPost;
  width: number;
  /** What a locked row says under its padlock. */
  lockedHint: string;
  /** Open the full-screen view from this row's square (its measured place, for the morph). */
  onOpen: (postId: string, source: MorphSource | null) => void;
  onAvatarPress: (userId: string) => void;
  onCommentPress: (postId: string) => void;
}): React.JSX.Element {
  const { dark, colors } = useAppTheme();
  const currentUser = useAuthStore((s) => s.user);
  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();
  const tile = gridTile(item);
  const square = width - SPACE.s16 * 2;
  const squareRef = useRef<View>(null);

  // Likes and counts move with the feed's copy of the post, the same as the full-screen card.
  const likedByMe = useSocialStore((s) => s.likedByMe[item.id] ?? item.liked_by_me);
  // Hold to preview: only a row that opens (a locked one has no photo) gets the pop-up.
  const menuOn = useContextMenuPreview();
  const withMenu = menuOn && !item.locked && !!tile.uri;
  const { width: screenW, height: screenH } = useWindowDimensions();
  const items = withMenu
    ? rowMenuItems({ liked: likedByMe, canShare: shareTarget(item) != null })
    : [];
  const counts = useFeedStore((s) => s.posts.find((p) => p.id === item.id));
  const likeCount = counts?.like_count ?? item.like_count;
  const commentCount = counts?.comment_count ?? item.comment_count;
  useEffect(() => {
    useSocialStore.getState().initPost(item.id, item.liked_by_me);
  }, [item.id, item.liked_by_me]);

  const open = useCallback(() => {
    if (item.locked || !tile.uri) {
      onOpen(item.id, null);
      return;
    }
    const uri = tile.uri;
    squareRef.current?.measureInWindow((x, y, w, h) => {
      onOpen(item.id, { x, y, width: w, height: h, uri, borderRadius: RADIUS.r16 });
    });
  }, [item.id, item.locked, tile.uri, onOpen]);

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

  const squareView = (
    <PressScale
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={item.locked ? `${name}'s post, locked` : `Open ${name}'s post`}
      accessibilityHint={item.locked ? lockedHint : 'Opens it full screen'}
      // VoiceOver: the menu's choices as actions (a double tap already opens the post).
      accessibilityActions={withMenu ? menuA11yActions(items, ['open']) : undefined}
      onAccessibilityAction={withMenu ? (e) => runAction(e.nativeEvent.actionName) : undefined}
    >
      <View
        ref={squareRef}
        collapsable={false}
        style={[styles.square, { width: square, height: square, backgroundColor: colors.border }]}
      >
        {!item.locked && tile.uri ? (
          <>
            <Image
              source={{ uri: tile.uri, cache: 'force-cache' }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            {item.pov_image_url && item.image_url ? (
              <Image
                source={{
                  uri: tile.uri === item.image_url ? item.pov_image_url : item.image_url,
                  cache: 'force-cache',
                }}
                style={[styles.inset, { borderColor: colors.bg }]}
                resizeMode="cover"
              />
            ) : null}
          </>
        ) : (
          <BlurView
            intensity={BLUR_INTENSITY.i60}
            tint={dark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, styles.lockedFill]}
          >
            <View style={[styles.lockPill, { backgroundColor: colors.text }]}>
              <LockIcon color={colors.bg} />
              <Text style={[styles.lockPillText, { color: colors.bg }]}>{lockedHint}</Text>
            </View>
          </BlurView>
        )}
      </View>
    </PressScale>
  );

  return (
    <View style={[styles.row, { backgroundColor: colors.bg }]}>
      {/* Who, and when. */}
      <Pressable
        style={({ pressed }) => [styles.who, pressed && { opacity: ALPHA.a75 }]}
        onPress={() => onAvatarPress(item.profiles.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s profile`}
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
        <View style={styles.whoWords}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.time, { color: colors.muted }]}>{relativeTime(item.created_at)}</Text>
        </View>
      </Pressable>

      {/* The square: both photos, or frosted with a padlock while locked. Hold it to preview. */}
      {withMenu ? (
        <PreviewMenu
          width={square}
          height={square}
          dark={dark}
          items={items}
          onAction={runAction}
          previewSize={previewSize({ width: screenW, height: screenH }, 'post')}
          previewBackground={colors.bg}
          renderPreview={() => <PostPreviewImage uri={tile.uri} />}
        >
          {squareView}
        </PreviewMenu>
      ) : (
        squareView
      )}

      {/* Caption, likes and comments stay on the row, like Facebook. */}
      {!item.locked && item.caption ? (
        <Text style={[styles.caption, { color: colors.text }]} numberOfLines={3}>
          {item.caption}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.action, pressed && { opacity: ALPHA.a75 }]}
          onPress={like}
          disabled={item.locked}
          accessibilityRole="button"
          accessibilityLabel={`Like, ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
          accessibilityState={{ selected: likedByMe }}
        >
          <HeartIcon size={ICON_SIZE.i22} color={colors.text} filled={likedByMe} />
          <Text style={[styles.count, { color: colors.text }]}>{likeCount}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.action, pressed && { opacity: ALPHA.a75 }]}
          onPress={() => onCommentPress(item.id)}
          disabled={item.locked}
          accessibilityRole="button"
          accessibilityLabel={`Comments, ${commentCount}`}
        >
          <CommentIcon size={ICON_SIZE.i22} color={colors.text} />
          <Text style={[styles.count, { color: colors.text }]}>{commentCount}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s12,
    gap: SPACE.s10,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s10,
  },
  whoWords: { flex: 1 },
  avatar: {
    width: SIZE.z40,
    height: SIZE.z40,
    borderRadius: RADIUS.r20,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER_WIDTH.w1,
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  name: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  time: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
  },
  square: {
    borderRadius: RADIUS.r16,
    overflow: 'hidden',
  },
  // The second shot, inset bottom-right like the full-screen view's picture-in-picture.
  inset: {
    position: 'absolute',
    right: SPACE.s10,
    bottom: SPACE.s10,
    width: SIZE.z72,
    height: SIZE.z96,
    borderRadius: RADIUS.r12,
    borderWidth: BORDER_WIDTH.w2,
  },
  lockedFill: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(COLORS.accent, ALPHA.a20),
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
    paddingVertical: SPACE.s8,
    paddingHorizontal: SPACE.s14,
    borderRadius: RADIUS.pill,
    marginHorizontal: SPACE.s24,
  },
  lockPillText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
  caption: {
    fontSize: FONT_SIZE.f14,
    lineHeight: LINE_HEIGHT.l20,
    fontFamily: FONTS.regular,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACE.s20,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
    minHeight: SIZE.z36,
  },
  count: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
  },
});
