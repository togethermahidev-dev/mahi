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

interface BlockedUsersSheetProps {
  visible: boolean;
  onClose: () => void;
  dark:    boolean;
}

export default function BlockedUsersSheet({
  visible,
  onClose,
  dark,
}: BlockedUsersSheetProps): React.JSX.Element {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const unblockAction = useBlockStore((s) => s.unblock);

  const bg       = dark ? '#1C1C19' : '#FFFFFF';
  const text     = dark ? '#E8E8E3' : '#1A1A17';
  const muted    = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const border   = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.12)';
  const avatarBg = dark ? '#2A2A27' : '#E8E8E3';
  const inputBg  = dark ? '#2A2A27' : '#F0F0ED';

  const [users, setUsers]     = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState('');

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
        u.username.toLowerCase().includes(q) ||
        (u.display_name?.toLowerCase().includes(q) ?? false),
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
              Sentry.addBreadcrumb({ category: 'moderation', message: `Unblocked: ${blockedUser.blocked_id}`, level: 'info' });

              const { error } = await unblockAction(currentUserId, blockedUser.blocked_id);
              if (error) {
                // Rollback — re-fetch the list
                fetchList();
              }
            },
          },
        ],
      );
    },
    [currentUserId, unblockAction, fetchList],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: border }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.backBtn, { borderColor: border }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
            estimatedItemSize={68}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: border }]} />
            )}
            renderItem={({ item }) => {
              const displayName = item.display_name ?? item.username ?? '\u2014';
              const initials    = displayName[0]?.toUpperCase() ?? '?';

              return (
                <View style={styles.row}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
                      <Text style={[styles.avatarInitial, { color: text }]}>{initials}</Text>
                    </View>
                  )}
                  <View style={styles.rowText}>
                    <Text style={[styles.name, { color: text }]}>{displayName}</Text>
                    <Text style={[styles.handle, { color: muted }]}>@{item.username}</Text>
                  </View>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingTop:        Platform.OS === 'ios' ? 60 : 32,
    paddingBottom:     16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width:          36,
    height:         36,
    borderRadius:   18,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize:   20,
    fontFamily: 'JosefinSans_400Regular_Italic',
    lineHeight: 22,
  },
  headerTitle: {
    flex:          1,
    textAlign:     'center',
    fontSize:      16,
    fontFamily:    'JosefinSans_700Bold',
    letterSpacing: 3,
  },
  searchWrap: {
    paddingHorizontal: 20,
    paddingVertical:   12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    height:         40,
    borderRadius:   20,
    paddingHorizontal: 16,
    fontFamily:     'JosefinSans_400Regular_Italic',
    fontSize:       14,
  },
  loadingWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical:   12,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingVertical: 12,
    gap:           12,
  },
  avatar: {
    width:        44,
    height:       44,
    borderRadius: 22,
  },
  avatarFallback: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize:   18,
    fontFamily: 'JosefinSans_700Bold',
  },
  rowText: {
    flex: 1,
    gap:  2,
  },
  name: {
    fontFamily:    'JosefinSans_600SemiBold',
    fontSize:      15,
    letterSpacing: 1,
  },
  handle: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize:   13,
  },
  unblockBtn: {
    borderWidth:       1,
    borderRadius:      50,
    paddingHorizontal: 14,
    paddingVertical:   6,
  },
  unblockBtnText: {
    fontSize:      10,
    fontFamily:    'JosefinSans_700Bold',
    letterSpacing: 2,
  },
  separator: {
    height: 1,
  },
  emptyWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingTop:     60,
  },
  emptyText: {
    fontSize:   13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
});
