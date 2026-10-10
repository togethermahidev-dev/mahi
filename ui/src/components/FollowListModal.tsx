import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View, Text, Image, Modal, StyleSheet, Pressable } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { getFollowList, getFriends, type FollowListUser } from '@/api';
import { useAuthStore, useFollowStore, useBlockStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { reportError } from '@/lib/sentry';
import { removeFollowerConfirm } from '@/lib/accountControls';
import { unfollowConfirm } from '@/lib/followBack';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import ListState from '@/components/ListState';
import UserProfileScreen from '@/screens/UserProfileScreen';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';
import { GLYPH, TYPOGRAPHY } from '@/constants/typography';
import { themeColors } from '@/hooks/useAppTheme';

interface FollowListModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  type: 'followers' | 'following' | 'friends';
  dark: boolean;
}

/**
 * Followers, Following or Friends, in the app's usual page sheet (owner, 2026-10-10: "open
 * normally rather than the current effect"): it slides up like Your invites and Follow requests,
 * and a swipe down, the close button or Android back closes it. All three lists open the same
 * way. Never kept on the phone: each open starts with a loading state, then the server's list,
 * and it listens for changes while open.
 */
export default function FollowListModal({
  visible,
  onClose,
  userId,
  type,
  dark,
}: FollowListModalProps): React.JSX.Element {
  const { bg } = themeColors(dark);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* A Modal is its own native window: gesture-handler needs its own root here (a profile
          opened from a row swipes closed with a pan), and the sheet's insets differ from the
          screen behind it. The sheet mounts on open, so the list starts fresh each time. */}
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider style={{ backgroundColor: bg }}>
          <Sheet onClose={onClose} userId={userId} type={type} dark={dark} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Sheet({ onClose, userId, type, dark }: Omit<FollowListModalProps, 'visible'>) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const toggleFollow = useFollowStore((s) => s.toggleFollow);
  const subscribeToFollows = useFollowStore((s) => s.subscribeToFollows);

  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted, border } = themeColors(dark);
  const surface = dark ? COLORS.surfaceDark : COLORS.white;
  const iconSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);

  const [users, setUsers] = useState<FollowListUser[]>([]);
  // Your own followers list: who of them you follow back (removing a friend ends open tags).
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  /** The list couldn't be read: say so (never "No friends yet"), with Try again. */
  const [failed, setFailed] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const top = useSafeAreaInsets().top;

  // Remove a follower (switch `private-accounts`): only on your own followers list.
  const privateAccountsOn = useFeatureFlag('private-accounts');
  const showRemove = privateAccountsOn && type === 'followers' && userId === currentUserId;

  const fetchList = useCallback(async () => {
    const [{ data, error }, friends] = await Promise.all([
      type === 'friends' ? getFriends(userId) : getFollowList(userId, type),
      showRemove ? getFriends(userId) : Promise.resolve(null),
    ]);
    if (error) reportError(error, { flow: 'follows', action: 'loadList', extra: { userId, type } });
    if (friends?.data) setFriendIds(new Set(friends.data.map((f) => f.id)));
    setFailed(!!error || !data);
    const filtered = (data ?? []).filter((u) => !useBlockStore.getState().isBlocked(u.id));
    setUsers(filtered);
    setLoading(false);
  }, [userId, type, showRemove]);

  // Read the list fresh on every open (the sheet mounts then, already loading) and listen for
  // changes while it is open.
  useEffect(() => {
    if (!currentUserId) return;
    void fetchList();
    return subscribeToFollows(userId, currentUserId, fetchList);
  }, [userId, currentUserId, fetchList, subscribeToFollows]);

  const runUnfollow = useCallback(
    async (targetUserId: string, handle: string) => {
      if (!currentUserId) return;
      // Optimistic removal from list
      setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      const { error } = await toggleFollow(currentUserId, targetUserId);
      if (error) {
        reportError(error, { flow: 'follows', action: 'unfollow', extra: { targetUserId } });
        // Rollback — re-fetch the list, and say why the row came back
        fetchList();
        useToastStore.getState().show(`Couldn’t unfollow ${handle}. Try again.`);
      }
    },
    [currentUserId, toggleFollow, fetchList]
  );

  // Ask first, saying what an unfollow ends (friends, a private account's workouts).
  const handleUnfollow = (targetUserId: string, handle: string) => {
    const { followsMe, privateById } = useFollowStore.getState();
    const ask = unfollowConfirm(handle, {
      followsYou: followsMe[targetUserId] ?? false,
      isPrivate: privateById[targetUserId] ?? false,
    });
    Alert.alert(ask.title, ask.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfollow',
        style: 'destructive',
        onPress: () => void runUnfollow(targetUserId, handle),
      },
    ]);
  };

  const runRemove = useCallback(
    async (followerId: string, handle: string) => {
      if (!currentUserId) return;
      setUsers((prev) => prev.filter((u) => u.id !== followerId));
      const { error } = await useFollowStore.getState().removeFollower(currentUserId, followerId);
      if (error) {
        reportError(error, {
          flow: 'follows',
          action: 'removeFollower',
          extra: { followerId, rpc: 'remove_follower' },
        });
        fetchList();
        useToastStore.getState().show(`Couldn’t remove ${handle}. Try again.`);
      }
    },
    [currentUserId, fetchList]
  );

  // Ask first, and say a friend's open tags end too.
  const handleRemove = (item: FollowListUser) => {
    const ask = removeFollowerConfirm(item.username, friendIds.has(item.id));
    Alert.alert(ask.title, ask.message, [
      { text: ask.cancel, style: 'cancel' },
      {
        text: ask.confirm,
        style: 'destructive',
        onPress: () => void runRemove(item.id, `@${item.username}`),
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
    <>
      <View style={[styles.root, { backgroundColor: bg }]}>
        <View style={[styles.header, { paddingTop: top + SPACE.s16 }]}>
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
            <Text style={[styles.backArrow, { color: text }]}>{'‹'}</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text
              style={[styles.headerTitle, { color: text }]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
            </Text>
          </View>
        </View>

        {loading ? (
          <ListState kind="loading" dark={dark} />
        ) : failed && users.length === 0 ? (
          <ListState kind="error" dark={dark} title="Couldn’t load this list" onAction={retry} />
        ) : (
          <FlashList
            data={users}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const displayName = item.display_name ?? item.first_name ?? item.username ?? '—';
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
                    <Image
                      source={{ uri: item.avatar_url, cache: 'force-cache' }}
                      style={styles.avatar}
                    />
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
                        handleUnfollow(item.id, item.username ? `@${item.username}` : displayName)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Following @${item.username ?? displayName}`}
                      accessibilityHint="Asks before unfollowing"
                      hitSlop={OFFSET.o8}
                    >
                      <Text style={[styles.unfollowBtnText, { color: text }]}>Following</Text>
                    </Pressable>
                  ) : null}
                  {showRemove ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.unfollowBtn,
                        { backgroundColor: iconSurface, borderColor: border },
                        pressed && { opacity: ALPHA.a75 },
                      ]}
                      onPress={() => handleRemove(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove @${item.username ?? displayName}`}
                      accessibilityHint="Asks before removing this follower"
                      hitSlop={OFFSET.o8}
                    >
                      <Text style={[styles.unfollowBtnText, { color: text }]}>Remove</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <ListState kind="empty" dark={dark} title={emptyTitle} line={emptyLine} />
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
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // In a page sheet, which already starts below the status bar (its top inset is 0 there).
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
    ...GLYPH.icon,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    ...TYPOGRAPHY.sheetTitle,
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
    ...TYPOGRAPHY.h4,
  },
  rowText: {
    flex: 1,
    gap: SPACE.s2,
  },
  name: {
    ...TYPOGRAPHY.bodyStrong,
  },
  handle: {
    ...TYPOGRAPHY.caption,
  },
  unfollowBtn: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s6,
  },
  unfollowBtnText: {
    ...TYPOGRAPHY.labelStrong,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
});
