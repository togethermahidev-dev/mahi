import React from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { FlashList, useRecyclingState } from '@shopify/flash-list';
import Svg, { Path } from 'react-native-svg';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useProfilePosts } from '@/hooks/useProfilePosts';
import { streakText } from '@/lib/streakText';
import type { Database } from '@/types';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS, OFFSET, SIZE } from '@/constants/tokens';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PLACEHOLDER_IMG = require('../../assets/jogger.png') as number;

type PostRow = Database['public']['Tables']['posts']['Row'];

const COLS = 3;
const GAP = SPACE.s2;

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={SIZE.z48} height={SIZE.z48} viewBox="0 0 48 48" fill="none">
      <Path
        d="M24 30a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 18a4 4 0 0 1 4-4h2l3-4h18l3 4h2a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V18z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GridCell({
  post,
  dark,
  size,
  column,
  onPress,
}: {
  post: PostRow;
  dark: boolean;
  size: number;
  column: number;
  onPress: () => void;
}) {
  // FlashList reuses cells: forget a previous post's failed image when the post changes.
  const [imgError, setImgError] = useRecyclingState(false, [post.id]);
  const badgeBg = dark ? withAlpha(COLORS.offBlack, 0.75) : withAlpha(COLORS.offWhite, 0.75);
  const badgeText = dark ? COLORS.offWhite : COLORS.offBlack;
  const streak = streakText(post.streak_day);

  return (
    <Pressable
      // FlashList gives each column an equal third of the width; nudging each cell right by a
      // share of the gap keeps the photos equal with GAP between them.
      style={({ pressed }) => [
        styles.cell,
        { width: size, height: size, marginLeft: (column * GAP) / COLS },
        pressed && { opacity: 0.8 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={streak ? `${streak} post` : 'Post'}
    >
      <Image
        source={imgError || !post.image_url ? PLACEHOLDER_IMG : { uri: post.image_url }}
        style={{ width: size, height: size }}
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
      {streak ? (
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: badgeText }]}>{streak}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

interface ProfileMediaMapProps {
  userId: string;
  isSelf: boolean;
  onPostPress?: (post: PostRow) => void;
}

export default function ProfileMediaMap({
  userId,
  isSelf,
  onPostPress,
}: ProfileMediaMapProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);

  const { posts, isLoading, hasMore, loadMore } = useProfilePosts(userId);
  const { width } = useWindowDimensions();
  const cellSize = (width - GAP * (COLS - 1)) / COLS;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: bg }]}>
        <ActivityIndicator color={muted} />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: bg }]}>
        <CameraIcon color={muted} />
        <Text style={[styles.emptyTitle, { color: text }]}>
          {isSelf ? 'Upload your first workout' : 'No posts yet'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: muted }]}>
          {isSelf ? 'Snap a photo and it will appear here.' : "This user hasn't posted yet."}
        </Text>
      </View>
    );
  }

  return (
    <FlashList
      data={posts}
      keyExtractor={(item) => item.id}
      numColumns={COLS}
      style={{ backgroundColor: bg }}
      renderItem={({ item, index }) => (
        <GridCell
          post={item}
          dark={dark}
          size={cellSize}
          column={index % COLS}
          // Locked posts (no photo URL until the viewer posts) don't open.
          onPress={() => item.image_url && onPostPress?.(item)}
        />
      )}
      showsVerticalScrollIndicator={false}
      onEndReached={hasMore ? loadMore : undefined}
      onEndReachedThreshold={0.4}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s12,
    paddingHorizontal: SPACE.s32,
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
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.semiBold,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.italic,
    textAlign: 'center',
  },
});
