import React, { useMemo, useState } from 'react';
import { View, Text, Image, Modal, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useNotifications } from '@/hooks/useNotifications';
import { useBlockStore } from '@/store';
import type { NotificationWithActor } from '@/api';
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
} from '@/constants/tokens';

interface NotificationsScreenProps {
  visible: boolean;
  onClose: () => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (userId: string) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1_000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsScreen({
  visible,
  onClose,
  onOpenPost,
  onOpenProfile,
}: NotificationsScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.4) : withAlpha(COLORS.offBlack, 0.4);
  const border = dark ? withAlpha(COLORS.offWhite, 0.12) : withAlpha(COLORS.offBlack, 0.12);
  const avatarBg = dark ? withAlpha(COLORS.offWhite, 0.1) : withAlpha(COLORS.offBlack, 0.08);

  const { items, isLoading, refresh, markRead, markAllRead } = useNotifications();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };
  const blockedSet = useBlockStore((s) => s.blockedSet);
  const filteredItems = useMemo(
    () => items.filter((n) => !blockedSet.has(n.actor_id)),
    [items, blockedSet]
  );

  const handleClose = () => {
    markAllRead();
    onClose();
  };

  return (
    // Page sheet: slides up, and a swipe down closes it (which calls onRequestClose).
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.root, { backgroundColor: bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: border }]}>
          <Pressable
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: border },
              pressed && styles.pressed,
            ]}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
          >
            <Text style={[styles.backArrow, { color: text }]}>‹</Text>
          </Pressable>
          <Text style={[styles.headerName, { color: text }]} numberOfLines={1}>
            Notifications
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
          <FlashList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + SPACE.s12 },
            ]}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            renderItem={({ item }: { item: NotificationWithActor }) => {
              const name = item.actor.display_name ?? item.actor.username;
              const initials = name[0].toUpperCase();

              // DB CHECK constraint guarantees one of the known types; default covers
              // the generated-type widening to `string` so `caption` is always set.
              let caption: string;
              switch (item.type) {
                case 'like':
                  caption = `@${item.actor.username} liked your post`;
                  break;
                case 'comment':
                  caption = `@${item.actor.username} commented on your post`;
                  break;
                case 'follow':
                  caption = `@${item.actor.username} started following you`;
                  break;
                case 'tag':
                  caption = `@${item.actor.username} tagged you in a post`;
                  break;
                case 'tag_answered':
                  caption = `@${item.actor.username} answered your tag`;
                  break;
                case 'tag_missed':
                  caption = `The tag between you and @${item.actor.username} ran out`;
                  break;
                case 'streak_lost':
                  caption = `You missed @${item.actor.username}'s tag. Your streak is back to 0.`;
                  break;
                default:
                  caption = `@${item.actor.username}`;
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
                  <Pressable
                    style={({ pressed }) => pressed && styles.pressed}
                    onPress={handleAvatarPress}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}'s profile`}
                    hitSlop={{
                      top: OFFSET.o4,
                      bottom: OFFSET.o4,
                      left: OFFSET.o4,
                      right: OFFSET.o4,
                    }}
                  >
                    {item.actor.avatar_url ? (
                      <Image source={{ uri: item.actor.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View
                        style={[
                          styles.avatar,
                          styles.avatarFallback,
                          { backgroundColor: avatarBg },
                        ]}
                      >
                        <Text style={[styles.avatarInitials, { color: text }]}>{initials}</Text>
                      </View>
                    )}
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.rowText, pressed && styles.pressed]}
                    onPress={handleContentPress}
                    accessibilityRole="button"
                    accessibilityLabel={caption}
                  >
                    <Text style={[styles.rowCaption, { color: text }]} numberOfLines={2}>
                      {caption}
                    </Text>
                    <Text style={[styles.rowTime, { color: muted }]}>
                      {relativeTime(item.created_at)}
                    </Text>
                  </Pressable>

                  {item.is_read === false ? <View style={styles.unreadDot} /> : null}
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
  pressed: {
    opacity: 0.7,
  },
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    // Shown in a page sheet, which already starts below the status bar.
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
  headerName: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s12,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
  rowText: {
    flex: 1,
    gap: SPACE.s2,
  },
  rowCaption: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
    lineHeight: LINE_HEIGHT.l18,
  },
  rowTime: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.italic,
  },
  unreadDot: {
    width: SIZE.z8,
    height: SIZE.z8,
    borderRadius: RADIUS.r4,
    backgroundColor: COLORS.accent,
    marginLeft: 'auto',
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
