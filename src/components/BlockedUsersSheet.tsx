import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { getBlockedUsers, type BlockedUser } from '@/api';
import { useAuthStore, useBlockStore } from '@/store';
import { posthog } from '@/lib/posthog';
import { Sentry } from '@/lib/sentry';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS, OFFSET, SIZE, BORDER_WIDTH, LINE_HEIGHT, TRACKING } from '@/constants/tokens';

interface BlockedUsersSheetProps {
  visible: boolean;
  onClose: () => void;
  dark: boolean;
}

export default function BlockedUsersSheet({
  visible,
  onClose,
  dark,
}: BlockedUsersSheetProps): React.JSX.Element {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const unblockAction = useBlockStore((s) => s.unblock);

  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.12) : withAlpha(COLORS.offBlack, 0.12);
  const avatarBg = dark ? COLORS.surfaceDark : COLORS.offWhite;
  const inputBg = dark ? COLORS.surfaceDark : COLORS.surfaceLight2;

  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!currentUserId) return;
    const { data } = await getBlockedUsers(currentUserId);
    setUsers(data ?? []);
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    if (!visible) {
      setUsers([]);
      setLoading(true);
      setQuery('');
      setProfileUserId(null);
      return;
    }
    setLoading(true);
    fetchList();
  }, [visible, fetchList]);

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) || (u.display_name?.toLowerCase().includes(q) ?? false)
    );
  }, [users, query]);

  const handleUnblock = useCallback(
    (blockedUser: BlockedUser) => {
      Alert.alert(
        `Unblock @${blockedUser.username}?`,
        'They will be able to see your posts and message you again. You will need to re-follow each other.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: async () => {
              if (!currentUserId) return;
              // Optimistic removal from list
              setUsers((prev) => prev.filter((u) => u.blocked_id !== blockedUser.blocked_id));

              posthog.capture('user_unblocked', { unblocked_user_id: blockedUser.blocked_id });
              Sentry.addBreadcrumb({
                category: 'moderation',
                message: `Unblocked: ${blockedUser.blocked_id}`,
                level: 'info',
              });

              const { error } = await unblockAction(currentUserId, blockedUser.blocked_id);
              if (error) {
                // Rollback — re-fetch the list
                fetchList();
              }
            },
          },
        ]
      );
    },
    [currentUserId, unblockAction, fetchList]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
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
            BLOCKED USERS
          </Text>
          {/* Spacer to keep title centred */}
          <View style={styles.backBtn} />
        </View>

        {/* Search bar */}
        <View style={[styles.searchWrap, { borderBottomColor: border }]}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: inputBg, color: text }]}
            placeholder="Search blocked users..."
            placeholderTextColor={muted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={muted} />
          </View>
        ) : (
          <FlashList
            data={filtered}
            keyExtractor={(item) => item.blocked_id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: border }]} />
            )}
            renderItem={({ item }) => {
              const displayName = item.display_name ?? item.username ?? '\u2014';
              const initials = displayName[0]?.toUpperCase() ?? '?';

              return (
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowTappable}
                    activeOpacity={0.7}
                    onPress={() => setProfileUserId(item.blocked_id)}
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
                      <Text style={[styles.handle, { color: muted }]}>@{item.username}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.unblockBtn, { borderColor: text }]}
                    activeOpacity={0.75}
                    onPress={() => handleUnblock(item)}
                  >
                    <Text style={[styles.unblockBtnText, { color: text }]}>UNBLOCK</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyWrap}>
                  <Text style={[styles.emptyText, { color: muted }]}>
                    {query.trim() ? 'No results' : 'No blocked users'}
                  </Text>
                </View>
              ) : null
            }
          />
        )}
      </View>

      {/* Full-screen profile — opened when avatar/name is tapped */}
      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}
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
    paddingTop: Platform.OS === 'ios' ? SPACE.s60 : SPACE.s32,
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
  searchWrap: {
    paddingHorizontal: SPACE.s20,
    paddingVertical: SPACE.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    height: SIZE.z40,
    borderRadius: RADIUS.r20,
    paddingHorizontal: SPACE.s16,
    fontFamily: FONTS.italic,
    fontSize: FONT_SIZE.f14,
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
  rowTappable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  unblockBtn: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s6,
  },
  unblockBtnText: {
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
