import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { FeedPost, SharedPost } from '@/api';
import { themeColors } from '@/hooks/useAppTheme';
import { sharedPostUnavailableText } from '@/lib/sharedPost';
import { gridTile } from '@/lib/videoPosts';
import { VideoIcon } from '@/components/ScreenIcons';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  COLORS,
  FONT_SIZE,
  ICON_SIZE,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SHARE_SHEET,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/**
 * A post inside a chat bubble (owner, 2026-10-10): who posted it, its photo, and the note under it
 * if one was written. A post that can't be shown says why, with no photo: the server decides, by
 * the same who-can-see rules as anywhere else.
 *
 * It draws only: the bubble's hold menu takes the tap (`MessageHoldMenu`'s `onPress`), so holding
 * the photo still brings up the menu. VoiceOver opens it with a double tap (`onOpen`).
 */
export default function SharedPostCard({
  shared,
  note,
  background,
  dark,
  onOpen,
}: {
  shared: SharedPost;
  /** The message's words ('' when the post was sent with none). */
  note: string;
  /** The bubble's own colour (mine or theirs). */
  background: string;
  dark: boolean;
  onOpen: (post: FeedPost) => void;
}): React.JSX.Element {
  const { text, muted, border } = themeColors(dark);
  const words = note.trim();
  const noteLine = words ? <Text style={[styles.note, { color: text }]}>{words}</Text> : null;

  if (!shared.available) {
    return (
      <View style={[styles.card, { backgroundColor: background }]}>
        <Text style={[styles.unavailable, { color: muted }]}>
          {sharedPostUnavailableText(shared.reason)}
        </Text>
        {noteLine}
      </View>
    );
  }

  const post = shared.post;
  const name = post.profiles.display_name ?? `@${post.profiles.username}`;
  const tile = gridTile(post);
  return (
    <View
      style={[styles.card, { backgroundColor: background }]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}’s post${words ? `. ${words}` : ''}`}
      accessibilityHint="Opens it full screen"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') onOpen(post);
      }}
    >
      <View style={styles.poster}>
        {post.profiles.avatar_url ? (
          <Image
            source={{ uri: post.profiles.avatar_url, cache: 'force-cache' }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.centred, { backgroundColor: border }]}>
            <Text style={[styles.avatarInitial, { color: text }]}>
              {post.profiles.username[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <Text style={[styles.name, { color: text }]} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View style={[styles.photo, styles.centred, { backgroundColor: border }]}>
        {tile.uri ? (
          <Image
            source={{ uri: tile.uri, cache: 'force-cache' }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          // Two videos: no still to show.
          <VideoIcon size={ICON_SIZE.i32} color={muted} />
        )}
        {tile.video && tile.uri ? (
          <View style={styles.videoBadge}>
            <VideoIcon size={ICON_SIZE.i16} color={COLORS.white} />
          </View>
        ) : null}
      </View>
      {noteLine}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: SHARE_SHEET.postCardWidth,
    borderRadius: RADIUS.r16,
    overflow: 'hidden',
  },
  centred: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  poster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
    paddingHorizontal: SPACE.s10,
    paddingVertical: SPACE.s8,
  },
  avatar: {
    width: SIZE.z24,
    height: SIZE.z24,
    borderRadius: RADIUS.pill,
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.bold,
  },
  name: {
    flex: 1,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
  photo: {
    width: SHARE_SHEET.postCardWidth,
    aspectRatio: SHARE_SHEET.postCardAspect,
  },
  videoBadge: {
    position: 'absolute',
    top: OFFSET.o8,
    right: OFFSET.o8,
    width: SIZE.z28,
    height: SIZE.z28,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(COLORS.black, ALPHA.a40),
  },
  note: {
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s8,
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l20,
  },
  unavailable: {
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s12,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l18,
  },
});
