import React, { useState } from 'react';
import {
  View,
  Image,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useProfilePosts } from '@/hooks/useProfilePosts';
import type { Database } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PLACEHOLDER_IMG = require('../../assets/jogger.png') as number;

type PostRow = Database['public']['Tables']['posts']['Row'];

const COLS = 3;
const GAP = 2;
const CELL_SIZE = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
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

function GridCell({ post, dark, onPress }: { post: PostRow; dark: boolean; onPress: () => void }) {
  const [imgError, setImgError] = useState(false);
  const badgeBg   = dark ? 'rgba(26,26,23,0.75)' : 'rgba(232,232,227,0.75)';
  const badgeText = dark ? '#E8E8E3' : '#1A1A17';

  return (
    <TouchableOpacity style={styles.cell} onPress={onPress} activeOpacity={0.8}>
      <Image
        source={imgError || !post.image_url ? PLACEHOLDER_IMG : { uri: post.image_url }}
        style={styles.cellImage}
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <Text style={[styles.badgeText, { color: badgeText }]}>DAY {post.streak_day}</Text>
      </View>
    </TouchableOpacity>
  );
}

interface ProfileMediaMapProps {
  userId: string;
  isSelf: boolean;
  onPostPress?: (post: PostRow) => void;
}

export default function ProfileMediaMap({ userId, isSelf, onPostPress }: ProfileMediaMapProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg   = dark ? '#1C1C19' : '#FFFFFF';
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';

  const { posts, isLoading, hasMore, loadMore } = useProfilePosts(userId);

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
          {isSelf ? 'UPLOAD YOUR FIRST WORKOUT' : 'NO POSTS YET'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: muted }]}>
          {isSelf
            ? 'Snap a photo and it will appear here.'
            : "This user hasn't posted yet."}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      numColumns={COLS}
      style={{ backgroundColor: bg }}
      contentContainerStyle={styles.grid}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <GridCell post={item} dark={dark} onPress={() => onPostPress?.(item)} />
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
    gap: 12,
    paddingHorizontal: 32,
  },
  grid: {
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  cellImage: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    borderRadius: 50,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 1,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 3,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
  },
});
