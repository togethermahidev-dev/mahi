import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
import { getFollowList, getFriends, type FollowListUser } from '@/api';
import { useAuthStore, useFollowStore, useBlockStore } from '@/store';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  SPACE,
  RADIUS,
  OFFSET,
  SIZE,
  BORDER_WIDTH,
  LINE_HEIGHT,
  TRACKING,
} from '@/constants/tokens';

interface FollowListModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  type: 'followers' | 'following' | 'friends';
  dark: boolean;
}

export default function FollowListModal({
  visible,
  onClose,
  userId,
  type,
  dark,
}: FollowListModalProps): React.JSX.Element {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const toggleFollow = useFollowStore((s) => s.toggleFollow);
  const subscribeToFollows = useFollowStore((s) => s.subscribeToFollows);

  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.12) : withAlpha(COLORS.offBlack, 0.12);
  const avatarBg = dark ? COLORS.surfaceDark : COLORS.offWhite;

  const [users, setUsers] = useState<FollowListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    const { data } =
      type === 'friends' ? await getFriends(userId) : await getFollowList(userId, type);
    const filtered = (data ?? []).filter((u) => !useBlockStore.getState().isBlocked(u.id));
    setUsers(filtered);
    setLoading(false);
  }, [userId, type]);

  // Fetch list + subscribe to realtime changes
  useEffect(() => {
    if (!visible) {
      setUsers([]);
      setLoading(true);
      setProfileUserId(null);
      return;
    }
    if (!currentUserId) return;

    setLoading(true);
    fetchList();

    const unsubscribe = subscribeToFollows(userId, currentUserId, fetchList);
    return unsubscribe;
  }, [visible, userId, type, currentUserId, fetchList, subscribeToFollows]);

  const handleUnfollow = useCallback(
    async (targetUserId: string) => {
      if (!currentUserId) return;
      // Optimistic removal from list
      setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      const { error } = await toggleFollow(currentUserId, targetUserId);
      if (error) {
        // Rollback — re-fetch the list
        fetchList();
      }
    },
    [currentUserId, toggleFollow, fetchList]
  );

  const title = { followers: 'FOLLOWERS', following: 'FOLLOWING', friends: 'FRIENDS' }[type];
  const emptyMessage = {
    followers: 'No followers yet',
    following: 'Not following anyone yet',
    friends: 'No friends yet — friends are people who follow each other',
  }[type];

  // Show unfollow button only on the current user's own "following" list
  const showUnfollow = type === 'following' && userId === currentUserId;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* A Modal is its own native window: gesture-handler needs its own root here
          (the profile opened from a row swipes closed with a pan). */}
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.root, { backgroundColor: bg }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.backBtn, { borderColor: border }]}
              hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
            >
              <Text style={[styles.backArrow, { color: text }]}>{'\u2039'}</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: text }]} numberOfLines={1}>
              {title}
            </Text>
            {/* Spacer to keep title centred */}
            <View style={styles.backBtn} />
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={muted} />
            </View>
          ) : (
            <FlashList
              data={users}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => (
                <View style={[styles.separator, { backgroundColor: border }]} />
              )}
              renderItem={({ item }) => {
                const displayName =
                  item.display_name ?? item.first_name ?? item.username ?? '\u2014';
                const initials = displayName[0]?.toUpperCase() ?? '?';

                return (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      if (item.id === currentUserId) return;
                      setProfileUserId(item.id);
                    }}
                    style={styles.row}
                  >
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View
                        style={[
                          styles.avatar,
                          styles.avatarFallback,
                          { backgroundColor: avatarBg },
                        ]}
                      >
                        <Text style={[styles.avatarInitial, { color: text }]}>{initials}</Text>
                      </View>
                    )}
                    <View style={styles.rowText}>
                      <Text style={[styles.name, { color: text }]}>{displayName}</Text>
                      {item.username ? (
                        <Text style={[styles.handle, { color: muted }]}>@{item.username}</Text>
                      ) : null}
                    </View>
                    {showUnfollow ? (
                      <TouchableOpacity
                        style={[styles.unfollowBtn, { borderColor: text }]}
                        activeOpacity={0.75}
                        onPress={() => handleUnfollow(item.id)}
                      >
                        <Text style={[styles.unfollowBtnText, { color: text }]}>FOLLOWING</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                !loading ? (
                  <View style={styles.emptyWrap}>
                    <Text style={[styles.emptyText, { color: muted }]}>{emptyMessage}</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>

        {/* Full-screen profile — shown when a row is tapped */}
        {profileUserId ? (
          <UserProfileScreen
            key={profileUserId}
            userId={profileUserId}
            onBack={() => setProfileUserId(null)}
            dark={dark}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    // A page sheet already starts below the status bar.
    paddingTop: SPACE.s16,
    paddingBottom: SPACE.s16,
    paddingHorizontal: SPACE.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.italic,
    lineHeight: LINE_HEIGHT.l22,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t3,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: SPACE.s20,
    paddingVertical: SPACE.s12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.s12,
    gap: SPACE.s12,
  },
  avatar: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.bold,
  },
  rowText: {
    flex: 1,
    gap: SPACE.s2,
  },
  name: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
    letterSpacing: TRACKING.t1,
  },
  handle: {
    fontFamily: FONTS.italic,
    fontSize: FONT_SIZE.f13,
  },
  unfollowBtn: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s6,
  },
  unfollowBtnText: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t2,
  },
  separator: {
    height: SIZE.z1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACE.s60,
  },
  emptyText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
});
