import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { getFollowList, type FollowListUser, type ConversationPreview } from '@/api';
import { useAuthStore, useFollowStore } from '@/store';
import UserProfileOverlay from '@/components/UserProfileOverlay';
import ConversationScreen from '@/screens/ConversationScreen';

interface FollowListModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  type: 'followers' | 'following';
  dark: boolean;
}

export default function FollowListModal({
  visible,
  onClose,
  userId,
  type,
  dark,
}: FollowListModalProps): React.JSX.Element {
  const currentUserId       = useAuthStore((s) => s.user?.id);
  const toggleFollow        = useFollowStore((s) => s.toggleFollow);
  const subscribeToFollows  = useFollowStore((s) => s.subscribeToFollows);

  const bg       = dark ? '#1C1C19' : '#FFFFFF';
  const text     = dark ? '#E8E8E3' : '#1A1A17';
  const muted    = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const border   = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.12)';
  const avatarBg = dark ? '#2A2A27' : '#E8E8E3';

  const [users, setUsers]               = useState<FollowListUser[]>([]);
  const [loading, setLoading]           = useState(true);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [activeConvo, setActiveConvo]   = useState<ConversationPreview | null>(null);

  const fetchList = useCallback(async () => {
    const { data } = await getFollowList(userId, type);
    setUsers(data ?? []);
    setLoading(false);
  }, [userId, type]);

  // Fetch list + subscribe to realtime changes
  useEffect(() => {
    if (!visible) {
      setUsers([]);
      setLoading(true);
      setProfileUserId(null);
      setActiveConvo(null);
      return;
    }
    if (!currentUserId) return;

    setLoading(true);
    fetchList();

    const unsubscribe = subscribeToFollows(userId, currentUserId, fetchList);
    return unsubscribe;
  }, [visible, userId, type, currentUserId, fetchList, subscribeToFollows]);

  const handleUnfollow = useCallback(async (targetUserId: string) => {
    if (!currentUserId) return;
    // Optimistic removal from list
    setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
    const { error } = await toggleFollow(currentUserId, targetUserId);
    if (error) {
      // Rollback — re-fetch the list
      fetchList();
    }
  }, [currentUserId, toggleFollow, fetchList]);

  const title = type === 'followers' ? 'FOLLOWERS' : 'FOLLOWING';
  const emptyMessage = type === 'followers' ? 'No followers yet' : 'Not following anyone yet';

  // Show unfollow button only on the current user's own "following" list
  const showUnfollow = type === 'following' && userId === currentUserId;

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
              const displayName = item.display_name ?? item.first_name ?? item.username ?? '\u2014';
              const initials    = displayName[0]?.toUpperCase() ?? '?';

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
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
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

      {/* Profile overlay — shown when a row is tapped */}
      {profileUserId ? (
        <UserProfileOverlay
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onOpenConvo={(convo) => {
            setProfileUserId(null);
            setActiveConvo(convo);
          }}
          dark={dark}
        />
      ) : null}

      {/* Conversation screen — opened from profile overlay MESSAGE button */}
      {activeConvo && currentUserId ? (
        <ConversationScreen
          conversation={activeConvo}
          currentUserId={currentUserId}
          onBack={() => setActiveConvo(null)}
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
  unfollowBtn: {
    borderWidth:       1,
    borderRadius:      50,
    paddingHorizontal: 14,
    paddingVertical:   6,
  },
  unfollowBtnText: {
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
