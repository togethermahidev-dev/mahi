import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Platform } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMessages } from '@/hooks/useMessages';
import { useAuthStore } from '@/store';
import ConversationScreen from '@/screens/ConversationScreen';
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

function RequestRow({
  item,
  showAccept,
  onPress,
  onAccept,
  onDeny,
  text,
  muted,
  border,
}: {
  item: ConversationPreview;
  showAccept: boolean;
  onPress: () => void;
  onAccept: () => void;
  onDeny: () => void;
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

      <View style={styles.convoRight}>
        <Text style={[styles.convoTime, { color: muted }]}>{relativeTime(item.updated_at)}</Text>
        {showAccept ? (
          <View style={styles.actionBtns}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: text }]}
              onPress={onAccept}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionBtnText, { color: text }]}>ACCEPT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.denyBtn]}
              onPress={onDeny}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionBtnText, styles.denyText]}>DENY</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.pendingLabel, { color: muted }]}>PENDING</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

interface MessageRequestsScreenProps {
  onBack: () => void;
}

export default function MessageRequestsScreen({
  onBack,
}: MessageRequestsScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? '#1C1C19' : '#FFFFFF';
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.4)' : 'rgba(26,26,23,0.4)';
  const border = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.12)';

  const { requests, isLoading, refresh, accept, deny } = useMessages();
  const userId = useAuthStore((s) => s.user?.id);

  const [openConvo, setOpenConvo] = React.useState<ConversationPreview | null>(null);

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backBtn, { borderColor: muted }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.backArrow, { color: text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: text }]}>REQUESTS</Text>
        <View style={styles.backSpacer} />
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          // Only receivers (not the original requester) see accept/deny controls.
          const isReceiver = !item.is_requester;
          return (
            <RequestRow
              item={item}
              showAccept={isReceiver}
              onPress={() => setOpenConvo(item)}
              onAccept={() => accept(item.id)}
              onDeny={() => deny(item.id)}
              text={text}
              muted={muted}
              border={border}
            />
          );
        }}
        refreshing={isLoading}
        onRefresh={refresh}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.placeholder}>
              <Text style={[styles.placeholderTitle, { color: text }]}>NO REQUESTS</Text>
              <Text style={[styles.placeholderSub, { color: muted }]}>You're all caught up</Text>
            </View>
          ) : null
        }
      />

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
  convoRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  convoTime: {
    fontSize: 11,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  actionBtns: {
    gap: 5,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  denyBtn: {
    borderColor: '#FF6B6B',
  },
  actionBtnText: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
  },
  denyText: {
    color: '#FF6B6B',
  },
  pendingLabel: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
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
