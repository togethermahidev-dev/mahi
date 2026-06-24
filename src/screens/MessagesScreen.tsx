import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Platform } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMessages } from '@/hooks/useMessages';
import { useAuthStore } from '@/store';
import ConversationScreen from '@/screens/ConversationScreen';
import MessageRequestsScreen from '@/screens/MessageRequestsScreen';
import type { ConversationPreview } from '@/api';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ConvoRow({
  item,
  onPress,
  text,
  muted,
  border,
}: {
  item: ConversationPreview;
  onPress: () => void;
  text: string;
  muted: string;
  border: string;
}) {
  const name = item.other_profile.display_name ?? item.other_profile.username;
  const initials = (item.other_profile.username ?? '?')[0].toUpperCase();
  const preview = item.last_message?.content
    ? item.last_message.content.length > 40
      ? item.last_message.content.slice(0, 40) + '…'
      : item.last_message.content
    : '';

  return (
    <TouchableOpacity
      style={[styles.convoRow, { borderBottomColor: border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {item.other_profile.avatar_url ? (
        <Image source={{ uri: item.other_profile.avatar_url }} style={styles.convoAvatar} />
      ) : (
        <View style={[styles.convoAvatar, styles.convoAvatarFallback, { backgroundColor: muted }]}>
          <Text style={[styles.convoInitial, { color: text }]}>{initials}</Text>
        </View>
      )}

      <View style={styles.convoInfo}>
        <Text style={[styles.convoName, { color: text }]}>{name}</Text>
        {preview ? <Text style={[styles.convoPreview, { color: muted }]}>{preview}</Text> : null}
      </View>

      <Text style={[styles.convoTime, { color: muted }]}>{relativeTime(item.updated_at)}</Text>
    </TouchableOpacity>
  );
}

interface MessagesScreenProps {
  onBack?: () => void;
}

export default function MessagesScreen({ onBack }: MessagesScreenProps = {}): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? '#1C1C19' : '#FFFFFF';
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.4)' : 'rgba(26,26,23,0.4)';
  const border = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.12)';

  const [openConvo, setOpenConvo] = useState<ConversationPreview | null>(null);
  const [showRequests, setShowRequests] = useState(false);

  const { inbox, requests, isLoading, refresh } = useMessages();
  const userId = useAuthStore((s) => s.user?.id);

  // Only requests addressed to *this* user (i.e., where they are the receiver,
  // not the requester) count toward the attention badge.
  const incomingRequestCount = useMemo(
    () => requests.filter((r) => !r.is_requester).length,
    [requests]
  );

  if (showRequests) {
    return <MessageRequestsScreen onBack={() => setShowRequests(false)} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={[styles.backBtn, { borderColor: muted }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.backArrow, { color: text }]}>‹</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.headerTitle, { color: text }]}>MESSAGES</Text>
        {onBack ? <View style={styles.backSpacer} /> : null}
      </View>

      {/* Requests pill row — shows badge with count of incoming (non-self) requests */}
      <TouchableOpacity
        style={[styles.requestsPill, { borderBottomColor: border }]}
        onPress={() => setShowRequests(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.requestsLabel, { color: text }]}>MESSAGE REQUESTS</Text>
        <View style={styles.requestsRight}>
          {incomingRequestCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{incomingRequestCount}</Text>
            </View>
          ) : null}
          <Text style={[styles.chevron, { color: muted }]}>›</Text>
        </View>
      </TouchableOpacity>

      {/* Inbox list */}
      <FlatList
        data={inbox}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConvoRow
            item={item}
            onPress={() => setOpenConvo(item)}
            text={text}
            muted={muted}
            border={border}
          />
        )}
        refreshing={isLoading}
        onRefresh={refresh}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.placeholder}>
              <Text style={[styles.placeholderTitle, { color: text }]}>INBOX</Text>
              <Text style={[styles.placeholderSub, { color: muted }]}>No messages yet</Text>
            </View>
          ) : null
        }
      />

      {/* ConversationScreen overlay */}
      {openConvo && userId ? (
        <ConversationScreen
          conversation={openConvo}
          currentUserId={userId}
          onBack={() => setOpenConvo(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backArrow: {
    fontSize: 20,
    fontFamily: 'JosefinSans_400Regular_Italic',
    lineHeight: 22,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 8,
    textAlign: 'center',
  },
  backSpacer: {
    width: 36,
    marginLeft: 12,
  },
  requestsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  requestsLabel: {
    fontSize: 12,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 3,
  },
  requestsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'JosefinSans_700Bold',
    lineHeight: 14,
  },
  chevron: {
    fontSize: 22,
    fontFamily: 'JosefinSans_400Regular_Italic',
    lineHeight: 22,
  },
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  convoAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  convoAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  convoInitial: {
    fontSize: 16,
    fontFamily: 'JosefinSans_700Bold',
  },
  convoInfo: {
    flex: 1,
    gap: 3,
  },
  convoName: {
    fontSize: 13,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 1.5,
  },
  convoPreview: {
    fontSize: 12,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  convoTime: {
    fontSize: 11,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 8,
  },
  placeholderTitle: {
    fontSize: 20,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 6,
  },
  placeholderSub: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
});
