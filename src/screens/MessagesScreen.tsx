import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Modal, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useTabBarRoom } from '@/hooks/useChrome';
import { useMessages } from '@/hooks/useMessages';
import { useContextMenuPreview } from '@/hooks/useContextMenuPreview';
import { useAuthStore, useConversationStore } from '@/store';
import ConversationScreen from '@/screens/ConversationScreen';
import MessageRequestsScreen from '@/screens/MessageRequestsScreen';
import UserProfileScreen from '@/screens/UserProfileScreen';
import GlobalSearchOverlay from '@/components/GlobalSearchOverlay';
import { SearchIcon } from '@/components/ScreenIcons';
import PreviewMenu from '@/components/PreviewMenu';
import ChatPreview from '@/components/ChatPreview';
import {
  isMenuAction,
  menuA11yActions,
  messagesMenuItems,
  previewSize,
} from '@/lib/contextMenuPreview';
import type { ConversationPreview } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  SPACE,
  RADIUS,
  OFFSET,
  ICON_SIZE,
  SIZE,
  BORDER_WIDTH,
  LINE_HEIGHT,
  TRACKING,
} from '@/constants/tokens';

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
  menuOn,
  dark,
  currentUserId,
}: {
  item: ConversationPreview;
  onPress: () => void;
  onAvatarPress: () => void;
  text: string;
  muted: string;
  border: string;
  accent: string;
  /** Hold to preview (flag context-menu-preview, iPhone, build 11). */
  menuOn: boolean;
  dark: boolean;
  currentUserId: string | undefined;
}) {
  const name = item.other_profile.display_name ?? item.other_profile.username;
  const initials = (item.other_profile.username ?? '?')[0].toUpperCase();
  const preview = item.last_message?.content
    ? item.last_message.content.length > 40
      ? item.last_message.content.slice(0, 40) + '…'
      : item.last_message.content
    : '';
  const unread = item.unread_count > 0;

  // Hold to preview: the latest messages pop out, with Open and (while unread) Mark as read.
  const screen = useWindowDimensions();
  const items = menuOn ? messagesMenuItems({ unread }) : [];
  const runAction = (action: string) => {
    if (!isMenuAction(action)) return;
    if (action === 'open') onPress();
    else if (action === 'mark-read') useConversationStore.getState().markRead(item.id);
  };

  // Avatar and body are SIBLINGS (not nested pressables) so the touch targets
  // don't overlap: tapping the avatar opens the profile, tapping the rest of
  // the row opens the conversation. No dead zone between them.
  const row = (
    <View style={[styles.convoRow, { borderBottomColor: border }]}>
      <Pressable
        style={({ pressed }) => pressed && styles.pressed}
        onPress={onAvatarPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}'s profile`}
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
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.convoBody, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Conversation with ${name}${unread ? ', unread' : ''}`}
        hitSlop={{ top: OFFSET.o14, bottom: OFFSET.o14, right: OFFSET.o8 }}
        // VoiceOver: the menu's choices as actions (a double tap already opens the chat).
        accessibilityActions={menuOn ? menuA11yActions(items, ['open']) : undefined}
        onAccessibilityAction={menuOn ? (e) => runAction(e.nativeEvent.actionName) : undefined}
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
      </Pressable>
    </View>
  );

  if (!menuOn) return row;
  return (
    <PreviewMenu
      width={screen.width}
      dark={dark}
      items={items}
      onAction={runAction}
      previewSize={previewSize(screen, 'chat')}
      previewBackground={dark ? COLORS.bgDark : COLORS.white}
      renderPreview={() => (
        <ChatPreview
          conversationId={item.id}
          name={name}
          currentUserId={currentUserId}
          dark={dark}
        />
      )}
    >
      {row}
    </PreviewMenu>
  );
}

interface MessagesScreenProps {
  onBack?: () => void;
}

export default function MessagesScreen({ onBack }: MessagesScreenProps = {}): React.JSX.Element {
  const { dark, colors } = useAppTheme();
  // The last row scrolls clear of the phone's tab bar.
  const tabRoom = useTabBarRoom();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.4) : withAlpha(COLORS.offBlack, 0.4);
  const border = dark ? withAlpha(COLORS.offWhite, 0.12) : withAlpha(COLORS.offBlack, 0.12);
  const accent = colors.accent;
  const insets = useSafeAreaInsets();

  const [openConvo, setOpenConvo] = useState<ConversationPreview | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  // Profile overlay — mirrors FeedScreen's local overlay state (avatar → profile).
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const { inbox, requests, isLoading, refresh } = useMessages();
  const userId = useAuthStore((s) => s.user?.id);
  const menuOn = useContextMenuPreview();

  // Only requests addressed to *this* user (i.e., where they are the receiver,
  // not the requester) count toward the attention badge.
  const incomingRequestCount = useMemo(
    () => requests.filter((r) => !r.is_requester).length,
    [requests]
  );

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View
        style={[styles.header, { borderBottomColor: border, paddingTop: insets.top + SPACE.s8 }]}
      >
        {onBack ? (
          <Pressable
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: muted },
              pressed && styles.pressed,
            ]}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
          >
            <Text style={[styles.backArrow, { color: text }]}>‹</Text>
          </Pressable>
        ) : (
          // Spacer balances the right-side search icon so the title stays centred.
          <View style={styles.headerIconBtn} />
        )}
        <Text style={[styles.headerTitle, { color: text }]}>Messages</Text>
        <Pressable
          style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed]}
          onPress={() => setSearchVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Search"
          hitSlop={{ top: OFFSET.o10, bottom: OFFSET.o10, left: OFFSET.o10, right: OFFSET.o10 }}
        >
          <SearchIcon size={ICON_SIZE.i22} color={text} />
        </Pressable>
      </View>

      {/* Requests pill row — shows badge with count of incoming (non-self) requests */}
      <Pressable
        style={({ pressed }) => [
          styles.requestsPill,
          { borderBottomColor: border },
          pressed && styles.pressed,
        ]}
        onPress={() => setShowRequests(true)}
        accessibilityRole="button"
        accessibilityLabel={
          incomingRequestCount > 0
            ? `Message requests, ${incomingRequestCount} new`
            : 'Message requests'
        }
      >
        <Text style={[styles.requestsLabel, { color: text }]}>Message requests</Text>
        <View style={styles.requestsRight}>
          {incomingRequestCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{incomingRequestCount}</Text>
            </View>
          ) : null}
          <Text style={[styles.chevron, { color: muted }]}>›</Text>
        </View>
      </Pressable>

      {/* Inbox list */}
      <FlashList
        data={inbox}
        keyExtractor={(item) => item.id}
        contentContainerStyle={tabRoom > 0 ? { paddingBottom: tabRoom } : undefined}
        // Rows re-render when hold to preview changes.
        extraData={menuOn}
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
            menuOn={menuOn}
            dark={dark}
            currentUserId={userId}
          />
        )}
        refreshing={isLoading}
        onRefresh={refresh}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.placeholder}>
              <Text style={[styles.placeholderTitle, { color: text }]}>Inbox</Text>
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
  pressed: {
    opacity: 0.7,
  },
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
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
  },
  placeholderSub: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
});
