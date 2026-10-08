import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
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
  SWIPE,
  TRACKING,
  VIEWER,
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
  // Your own followers list: who of them you follow back (removing a friend ends open tags).
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  /** The list couldn't be read: say so (never "No friends yet"), with Try again. */
  const [failed, setFailed] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const top = useSafeAreaInsets().top;
  const dismissX = useSharedValue(width);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const finishClose = useCallback(() => onCloseRef.current(), []);
  const close = useCallback(() => {
    dismissX.value = withTiming(width, { duration: VIEWER.closeMs }, (finished) => {
      if (finished) scheduleOnRN(finishClose);
    });
  }, [dismissX, finishClose, width]);
  const dismiss = Gesture.Pan()
    .enabled(!profileUserId)
    .activeOffsetX([SWIPE.slop, SWIPE.slop])
    .failOffsetX(-SWIPE.slop)
    .failOffsetY([-SWIPE.slop, SWIPE.slop])
    .onUpdate((event) => {
      'worklet';
      dismissX.value = Math.max(0, event.translationX);
    })
    .onEnd((event) => {
      'worklet';
      const shouldDismiss =
        event.translationX > VIEWER.closeDistance || event.velocityX > VIEWER.closeVelocity;
      if (shouldDismiss) {
        dismissX.value = withTiming(width, { duration: VIEWER.closeMs }, (finished) => {
          if (finished) scheduleOnRN(finishClose);
        });
      } else {
        dismissX.value = withSpring(0, VIEWER.snapBack);
      }
    });
  const dismissStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dismissX.value }] }));

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

  // Fetch list + subscribe to realtime changes
  useEffect(() => {
    if (!visible) {
      dismissX.value = width;
      setUsers([]);
      setLoading(true);
      setFailed(false);
      setProfileUserId(null);
      return;
    }
    dismissX.value = withSpring(0, VIEWER.snapBack);
    if (!currentUserId) return;

    setLoading(true);
    fetchList();

    const unsubscribe = subscribeToFollows(userId, currentUserId, fetchList);
    return unsubscribe;
  }, [visible, userId, type, currentUserId, fetchList, subscribeToFollows, dismissX, width]);

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
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      onRequestClose={close}
    >
      {/* A Modal is its own native window, so gesture-handler and safe-area context each need a
          root here. overFullScreen lets the previous profile show behind the right swipe. */}
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <GestureDetector gesture={dismiss}>
            <Reanimated.View style={[styles.root, { backgroundColor: bg }, dismissStyle]}>
              <View style={[styles.header, { paddingTop: top + SPACE.s12 }]}>
                <Pressable
                  style={({ pressed }) => [
                    styles.backBtn,
                    { backgroundColor: iconSurface, borderColor: border },
                    pressed && styles.pressed,
                  ]}
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
                >
                  <Text style={[styles.backArrow, { color: text }]}>{'\u2039'}</Text>
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
                    !loading ? (
                      <ListState kind="empty" dark={dark} title={emptyTitle} line={emptyLine} />
                    ) : null
                  }
                />
              )}
            </Reanimated.View>
          </GestureDetector>

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
