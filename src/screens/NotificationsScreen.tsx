import React, { useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useNotifications } from '@/hooks/useNotifications';
import { useBlockStore } from '@/store';
import type { NotificationWithActor } from '@/api';

interface NotificationsScreenProps {
  visible:       boolean;
  onClose:       () => void;
  onOpenPost:    (postId: string) => void;
  onOpenProfile: (userId: string) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1_000);
  if (secs < 60)  return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsScreen({
  visible,
  onClose,
  onOpenPost,
  onOpenProfile,
}: NotificationsScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg       = dark ? '#1C1C19' : '#FFFFFF';
  const text     = dark ? '#E8E8E3' : '#1A1A17';
  const muted    = dark ? 'rgba(232,232,227,0.4)'  : 'rgba(26,26,23,0.4)';
  const border   = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.12)';
  const avatarBg = dark ? 'rgba(232,232,227,0.1)'  : 'rgba(26,26,23,0.08)';

  const { items, isLoading, markRead, markAllRead } = useNotifications();
  const blockedSet = useBlockStore((s) => s.blockedSet);
  const filteredItems = useMemo(
    () => items.filter((n) => !blockedSet.has(n.actor_id)),
    [items, blockedSet],
  );

  const handleClose = () => {
    markAllRead();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={[styles.root, { backgroundColor: bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: border }]}>
          <TouchableOpacity
            onPress={handleClose}
            style={[styles.backBtn, { borderColor: border }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.backArrow, { color: text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerName, { color: text }]} numberOfLines={1}>
            NOTIFICATIONS
          </Text>
          {/* Spacer to keep title centred */}
          <View style={styles.backBtn} />
        </View>

        {/* Notification list */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={muted} />
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }: { item: NotificationWithActor }) => {
              const name     = item.actor.display_name ?? item.actor.username;
              const initials = name[0].toUpperCase();

              // DB CHECK constraint guarantees one of the 4 types; default covers
              // the generated-type widening to `string` so `caption` is always set.
              let caption: string;
              switch (item.type) {
                case 'like':
                  caption    = `@${item.actor.username} liked your post`;
                  break;
                case 'comment':
                  caption    = `@${item.actor.username} commented on your post`;
                  break;
                case 'follow':
                  caption    = `@${item.actor.username} started following you`;
                  break;
                case 'tag':
                  caption    = `@${item.actor.username} tagged you in a post`;
                  break;
                default:
                  caption    = `@${item.actor.username}`;
              }

              const handleAvatarPress = () => {
                markRead(item.id);
                onOpenProfile(item.actor_id);
                onClose();
              };

              const handleContentPress = () => {
                markRead(item.id);
                if (item.type === 'follow') {
                  onOpenProfile(item.actor_id);
                } else if (item.post_id) {
                  onOpenPost(item.post_id);
                } else {
                  onOpenProfile(item.actor_id);
                }
                onClose();
              };

              return (
                <View style={[styles.row, { borderBottomColor: border }]}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleAvatarPress}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    {item.actor.avatar_url ? (
                      <Image
                        source={{ uri: item.actor.avatar_url }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
                        <Text style={[styles.avatarInitials, { color: text }]}>{initials}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleContentPress}
                    style={styles.rowText}
                  >
                    <Text style={[styles.rowCaption, { color: text }]} numberOfLines={2}>
                      {caption}
                    </Text>
                    <Text style={[styles.rowTime, { color: muted }]}>
                      {relativeTime(item.created_at)}
                    </Text>
                  </TouchableOpacity>

                  {item.is_read === false ? (
                    <View style={styles.unreadDot} />
                  ) : null}
                </View>
              );
            }}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyWrap}>
                  <Text style={[styles.emptyText, { color: muted }]}>No notifications yet</Text>
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
  headerName: {
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
    paddingHorizontal: 16,
    paddingVertical:   12,
    flexGrow:          1,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    paddingVertical:   12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width:        36,
    height:       36,
    borderRadius: 18,
  },
  avatarFallback: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize:   14,
    fontFamily: 'JosefinSans_700Bold',
  },
  rowText: {
    flex: 1,
    gap:  2,
  },
  rowCaption: {
    fontSize:   13,
    fontFamily: 'JosefinSans_400Regular_Italic',
    lineHeight: 18,
  },
  rowTime: {
    fontSize:   10,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  unreadDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#59c2d7',
    marginLeft:      'auto',
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
