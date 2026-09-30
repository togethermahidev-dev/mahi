import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  Modal,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMessages } from '@/hooks/useMessages';
import { useAuthStore } from '@/store';
import ConversationScreen from '@/screens/ConversationScreen';
import MessageRequestsScreen from '@/screens/MessageRequestsScreen';
import UserProfileScreen from '@/screens/UserProfileScreen';
import GlobalSearchOverlay from '@/components/GlobalSearchOverlay';
import { SearchIcon } from '@/components/ScreenIcons';
import type { ConversationPreview } from '@/api';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS, OFFSET, ICON_SIZE, SIZE, BORDER_WIDTH, LINE_HEIGHT, TRACKING } from '@/constants/tokens';

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
  onAvatarPress,
  text,
  muted,
  border,
  accent,
}: {
  item: ConversationPreview;
  onPress: () => void;
  onAvatarPress: () => void;
  text: string;
  muted: string;
  border: string;
  accent: string;
}) {
  const name = item.other_profile.display_name ?? item.other_profile.username;
  const initials = (item.other_profile.username ?? '?')[0].toUpperCase();
  const preview = item.last_message?.content
    ? item.last_message.content.length > 40
      ? item.last_message.content.slice(0, 40) + '…'
      : item.last_message.content
    : '';
  const unread = item.unread_count > 0;

  // Avatar and body are SIBLINGS (not nested pressables) so the touch targets
  // don't overlap: tapping the avatar opens the profile, tapping the rest of
  // the row opens the conversation. No dead zone between them.
  return (
    <View style={[styles.convoRow, { borderBottomColor: border }]}>
      <TouchableOpacity
        onPress={onAvatarPress}
        activeOpacity={0.7}
        hitSlop={{ top: OFFSET.o14, bottom: OFFSET.o14, left: OFFSET.o8, right: OFFSET.o8 }}
      >
        {item.other_profile.avatar_url ? (
          <Image source={{ uri: item.other_profile.avatar_url }} style={styles.convoAvatar} />
        ) : (
          <View
            style={[styles.convoAvatar, styles.convoAvatarFallback, { backgroundColor: muted }]}
          >
            <Text style={[styles.convoInitial, { color: text }]}>{initials}</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.convoBody}
        onPress={onPress}
        activeOpacity={0.7}
        hitSlop={{ top: OFFSET.o14, bottom: OFFSET.o14, right: OFFSET.o8 }}
      >
        <View style={styles.convoInfo}>
          <Text style={[styles.convoName, { color: text }]}>{name}</Text>
          {preview ? (
            <Text style={[styles.convoPreview, { color: unread ? text : muted }]}>{preview}</Text>
          ) : null}
        </View>

        <View style={styles.convoMeta}>
          <Text style={[styles.convoTime, { color: muted }]}>{relativeTime(item.updated_at)}</Text>
          {unread ? <View style={[styles.unreadDot, { backgroundColor: accent }]} /> : null}
        </View>
      </TouchableOpacity>
    </View>
  );
}

interface MessagesScreenProps {
  onBack?: () => void;
}

export default function MessagesScreen({ onBack }: MessagesScreenProps = {}): React.JSX.Element {
  const { dark, colors } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.4) : withAlpha(COLORS.offBlack, 0.4);
  const border = dark ? withAlpha(COLORS.offWhite, 0.12) : withAlpha(COLORS.offBlack, 0.12);
  const accent = colors.accent;

  const [openConvo, setOpenConvo] = useState<ConversationPreview | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  // Profile overlay — mirrors FeedScreen's local overlay state (avatar → profile).
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const { inbox, requests, isLoading, refresh } = useMessages();
  const userId = useAuthStore((s) => s.user?.id);

  // Only requests addressed to *this* user (i.e., where they are the receiver,
  // not the requester) count toward the attention badge.
  const incomingRequestCount = useMemo(
    () => requests.filter((r) => !r.is_requester).length,
    [requests]
  );

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={[styles.backBtn, { borderColor: muted }]}
            hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
          >
            <Text style={[styles.backArrow, { color: text }]}>‹</Text>
          </TouchableOpacity>
        ) : (
          // Spacer balances the right-side search icon so the title stays centred.
          <View style={styles.headerIconBtn} />
        )}
        <Text style={[styles.headerTitle, { color: text }]}>MESSAGES</Text>
        <TouchableOpacity
          onPress={() => setSearchVisible(true)}
          style={styles.headerIconBtn}
          hitSlop={{ top: OFFSET.o10, bottom: OFFSET.o10, left: OFFSET.o10, right: OFFSET.o10 }}
          activeOpacity={0.7}
        >
          <SearchIcon size={ICON_SIZE.i22} color={text} />
        </TouchableOpacity>
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
      <FlashList
        data={inbox}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConvoRow
            item={item}
            onPress={() => setOpenConvo(item)}
            onAvatarPress={() => {
              // Don't open an overlay for our own profile.
              if (item.other_profile.id === userId) return;
              setProfileUserId(item.other_profile.id);
            }}
            text={text}
            muted={muted}
            border={border}
            accent={accent}
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

      {/* Requests slide up as a sheet over the inbox; swipe down or tap back to close. */}
      <Modal
        visible={showRequests}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRequests(false)}
      >
        <MessageRequestsScreen onBack={() => setShowRequests(false)} />
      </Modal>

      {/* ConversationScreen overlay */}
      {openConvo && userId ? (
        <ConversationScreen
          conversation={openConvo}
          currentUserId={userId}
          onBack={() => setOpenConvo(null)}
        />
      ) : null}

      {/* Full-screen profile — shown when a conversation avatar is tapped */}
      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}

      {/* Global search overlay — reuses the same block-filtered overlay as the
          Camera pull-down. Its root is absoluteFill at zIndex 500, so it fully
          covers the Messages screen when opened from the header search icon. */}
      <GlobalSearchOverlay
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        dark={dark}
      />
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
    paddingTop: Platform.OS === 'ios' ? SPACE.s60 : SPACE.s32,
    paddingHorizontal: SPACE.s24,
    paddingBottom: SPACE.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACE.s12,
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.italic,
    lineHeight: LINE_HEIGHT.l22,
  },
  headerTitle: {
    flex: 1,
    fontSize: FONT_SIZE.f24,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t8,
    textAlign: 'center',
  },
  headerIconBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s24,
    paddingVertical: SPACE.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  requestsLabel: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    letterSpacing: TRACKING.t3,
  },
  requestsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s10,
  },
  badge: {
    minWidth: SIZE.z20,
    height: SIZE.z20,
    borderRadius: RADIUS.r10,
    paddingHorizontal: SPACE.s6,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l14,
  },
  chevron: {
    fontSize: FONT_SIZE.f22,
    fontFamily: FONTS.italic,
    lineHeight: LINE_HEIGHT.l22,
  },
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s24,
    paddingVertical: SPACE.s14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACE.s12,
  },
  convoBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
  },
  convoAvatar: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
  },
  convoAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  convoInitial: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
  },
  convoInfo: {
    flex: 1,
    gap: SPACE.s3,
  },
  convoName: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    letterSpacing: TRACKING.t1_5,
  },
  convoPreview: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.italic,
  },
  convoTime: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.italic,
  },
  convoMeta: {
    alignItems: 'flex-end',
    gap: SPACE.s5,
  },
  unreadDot: {
    width: SIZE.z8,
    height: SIZE.z8,
    borderRadius: RADIUS.r4,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACE.s60,
    gap: SPACE.s8,
  },
  placeholderTitle: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t6,
  },
  placeholderSub: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
});
