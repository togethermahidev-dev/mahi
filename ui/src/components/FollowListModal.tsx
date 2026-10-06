import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View, Text, Image, Modal, StyleSheet, Pressable } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { getFollowList, getFriends, type FollowListUser } from '@/api';
import { useAuthStore, useFollowStore, useBlockStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import ListState from '@/components/ListState';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  TRACKING,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';

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
  const { muted, border, accentText } = themeColors(dark);
  const surface = dark ? COLORS.surfaceDark : COLORS.white;
  const iconSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);

  const [users, setUsers] = useState<FollowListUser[]>([]);
  const [loading, setLoading] = useState(true);
  /** The list couldn't be read: say so (never "No friends yet"), with Try again. */
  const [failed, setFailed] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    const { data, error } =
      type === 'friends' ? await getFriends(userId) : await getFollowList(userId, type);
    setFailed(!!error || !data);
    const filtered = (data ?? []).filter((u) => !useBlockStore.getState().isBlocked(u.id));
    setUsers(filtered);
    setLoading(false);
  }, [userId, type]);

  // Fetch list + subscribe to realtime changes
  useEffect(() => {
    if (!visible) {
      setUsers([]);
      setLoading(true);
      setFailed(false);
      setProfileUserId(null);
      return;
    }
    if (!currentUserId) return;

    setLoading(true);
    fetchList();

    const unsubscribe = subscribeToFollows(userId, currentUserId, fetchList);
    return unsubscribe;
  }, [visible, userId, type, currentUserId, fetchList, subscribeToFollows]);

  const runUnfollow = useCallback(
    async (targetUserId: string, handle: string) => {
      if (!currentUserId) return;
      // Optimistic removal from list
      setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      const { error } = await toggleFollow(currentUserId, targetUserId);
      if (error) {
        // Rollback — re-fetch the list, and say why the row came back
        fetchList();
        useToastStore.getState().show(`Couldn’t unfollow ${handle}. Try again.`);
      }
    },
    [currentUserId, toggleFollow, fetchList]
  );

  // Ask first: an unfollow can end tagging each other.
  const handleUnfollow = (targetUserId: string, handle: string) => {
    Alert.alert(`Unfollow ${handle}?`, 'You won’t be able to tag each other.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfollow',
        style: 'destructive',
        onPress: () => void runUnfollow(targetUserId, handle),
      },
    ]);
  };

  const retry = () => {
    setLoading(true);
    void fetchList();
  };

  const title = { followers: 'Followers', following: 'Following', friends: 'Friends' }[type];
  const emptyTitle = {
    followers: 'No followers yet',
    following: 'Not following anyone yet',
    friends: 'No friends yet',
  }[type];
  const emptyLine =
    type === 'friends' ? 'Follow each other and you can tag each other.' : undefined;

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
          (the profile opened from a row swipes closed with a pan), and the safe area is
          the sheet's, which starts below the status bar. */}
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <View style={[styles.root, { backgroundColor: bg }]}>
            <View style={styles.header}>
              <Pressable
                style={({ pressed }) => [
                  styles.backBtn,
                  { backgroundColor: iconSurface, borderColor: border },
                  pressed && styles.pressed,
                ]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
              >
                <Text style={[styles.backArrow, { color: text }]}>{'\u2039'}</Text>
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={[styles.headerEyebrow, { color: accentText }]}>Mahi</Text>
                <Text
                  style={[styles.headerTitle, { color: text }]}
                  numberOfLines={1}
                  accessibilityRole="header"
                >
                  {title}
                </Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            {loading ? (
              <ListState kind="loading" dark={dark} />
            ) : failed && users.length === 0 ? (
              <ListState
                kind="error"
                dark={dark}
                title="Couldn’t load this list"
                onAction={retry}
              />
            ) : (
              <FlashList
                data={users}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const displayName =
                    item.display_name ?? item.first_name ?? item.username ?? '\u2014';
                  const initials = displayName[0]?.toUpperCase() ?? '?';

                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.row,
                        { backgroundColor: surface, borderColor: border },
                        pressed && styles.pressed,
                      ]}
                      onPress={() => {
                        if (item.id === currentUserId) return;
                        setProfileUserId(item.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${displayName}'s profile`}
                    >
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                      ) : (
                        <View
                          style={[
                            styles.avatar,
                            styles.avatarFallback,
                            { backgroundColor: iconSurface },
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
                        <Pressable
                          style={({ pressed }) => [
                            styles.unfollowBtn,
                            { backgroundColor: iconSurface, borderColor: border },
                            pressed && { opacity: ALPHA.a75 },
                          ]}
                          onPress={() =>
                            handleUnfollow(
                              item.id,
                              item.username ? `@${item.username}` : displayName
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Following @${item.username ?? displayName}`}
                          accessibilityHint="Asks before unfollowing"
                          hitSlop={OFFSET.o8}
                        >
                          <Text style={[styles.unfollowBtnText, { color: text }]}>Following</Text>
                        </Pressable>
                      ) : null}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  !loading ? (
                    <ListState kind="empty" dark={dark} title={emptyTitle} line={emptyLine} />
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
        </SafeAreaProvider>
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
    paddingBottom: SPACE.s20,
    paddingHorizontal: SPACE.s20,
    gap: SPACE.s12,
  },
  backBtn: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l22,
  },
  headerCopy: {
    flex: 1,
  },
  headerEyebrow: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACE.s2,
  },
  headerTitle: {
    fontSize: FONT_SIZE.f24,
    lineHeight: LINE_HEIGHT.l24,
    fontFamily: FONTS.bold,
  },
  headerSpacer: {
    width: SIZE.z44,
    height: SIZE.z44,
  },
  listContent: {
    paddingVertical: SPACE.s12,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
    minHeight: SIZE.z72,
    marginHorizontal: SPACE.s20,
    marginBottom: SPACE.s8,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s12,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r20,
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
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
  },
  unfollowBtn: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s6,
  },
  unfollowBtnText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.bold,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
});
