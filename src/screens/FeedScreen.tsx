import React from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeed } from '@/hooks/useFeed';
import type { FeedPost } from '@/api';

const SCREEN_WIDTH = Dimensions.get('window').width;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PostItem({ item, dark }: { item: FeedPost; dark: boolean }) {
  const text   = dark ? '#E8E8E3' : '#1A1A17';
  const muted  = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const border = dark ? 'rgba(232,232,227,0.1)'  : 'rgba(26,26,23,0.1)';
  const cardBg = dark ? '#252521' : '#F5F5F0';

  const name     = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
      {/* Header: avatar + username + streak day badge */}
      <View style={styles.cardHeader}>
        <View style={styles.avatarRow}>
          {item.profiles.avatar_url ? (
            <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: muted }]}>
              <Text style={[styles.avatarInitial, { color: text }]}>{initials}</Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={[styles.username, { color: text }]}>{name}</Text>
            <Text style={[styles.time, { color: muted }]}>{relativeTime(item.created_at)}</Text>
          </View>
        </View>
        <View style={[styles.streakBadge, { backgroundColor: muted }]}>
          <Text style={[styles.streakText, { color: text }]}>DAY {item.streak_day}</Text>
        </View>
      </View>

      {/* Post image */}
      <Image
        source={{ uri: item.image_url }}
        style={styles.postImage}
        resizeMode="cover"
      />

      {item.caption ? (
        <Text style={[styles.caption, { color: text }]}>{item.caption}</Text>
      ) : null}
    </View>
  );
}

export default function FeedScreen(): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg    = dark ? '#1C1C19' : '#FFFFFF';
  const text  = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';

  const { posts, isLoading, error, hasMore, loadMore, refresh } = useFeed();

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Fixed header — sits above the scroll list, no scroll conflict */}
      <View style={[styles.header, { borderBottomColor: dark ? 'rgba(232,232,227,0.08)' : 'rgba(26,26,23,0.06)' }]}>
        <Text style={[styles.headerTitle, { color: text }]}>SOCIAL FEED</Text>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostItem item={item} dark={dark} />}
        contentContainerStyle={styles.list}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && posts.length === 0}
            onRefresh={refresh}
            tintColor={text}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: text }]}>NO POSTS YET</Text>
              <Text style={[styles.emptySub, { color: muted }]}>
                Take your first streak photo to appear here
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          error ? (
            <Text style={[styles.errorText, { color: muted }]}>Failed to load feed</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 116 : 88,
    paddingBottom: 14,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'JosefinSans_700Bold',
    fontSize: 13,
    letterSpacing: 5,
  },
  list: {
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontFamily: 'JosefinSans_700Bold',
  },
  userInfo: {
    gap: 2,
  },
  username: {
    fontSize: 13,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 1.5,
  },
  time: {
    fontSize: 11,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  streakBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
  },
  streakText: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
  },
  postImage: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_WIDTH - 32,
  },
  caption: {
    padding: 12,
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 6,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    textAlign: 'center',
    padding: 16,
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
});
