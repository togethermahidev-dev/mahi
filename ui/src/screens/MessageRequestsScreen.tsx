import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, Alert, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { refreshTint } from '@/lib/themeColors';
import { useMessages } from '@/hooks/useMessages';
import { useAuthStore, useBlockStore } from '@/store';
import ConversationScreen from '@/screens/ConversationScreen';
import ListState from '@/components/ListState';
import type { ConversationPreview } from '@/api';
import { relativeTime } from '@/lib/relativeTime';
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
  TRACKING,
  withAlpha,
} from '@/constants/tokens';

function RequestRow({
  item,
  showAccept,
  onPress,
  onAccept,
  onDeny,
  onBlock,
  text,
  muted,
  border,
  surface,
  avatarBg,
}: {
  item: ConversationPreview;
  showAccept: boolean;
  onPress: () => void;
  onAccept: () => void;
  onDeny: () => void;
  onBlock: () => void;
  text: string;
  muted: string;
  border: string;
  surface: string;
  avatarBg: string;
}) {
  const { colors } = useAppTheme();
  const name = item.other_profile.display_name ?? item.other_profile.username;
  const initials = (item.other_profile.username ?? '?')[0].toUpperCase();
  const preview = item.last_message?.content
    ? item.last_message.content.length > 40
      ? item.last_message.content.slice(0, 40) + '…'
      : item.last_message.content
    : '';

  const time = (
    <Text style={[styles.convoTime, { color: muted }]}>{relativeTime(item.updated_at)}</Text>
  );

  // The row and the Accept / Deny buttons are SIBLINGS (not nested pressables), so a tap on a
  // button never also opens the conversation. Same pattern as MessagesScreen's ConvoRow.
  return (
    <View style={[styles.convoRow, { backgroundColor: surface, borderColor: border }]}>
      <Pressable
        style={({ pressed }) => [styles.convoBody, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Message request from ${name}`}
      >
        {item.other_profile.avatar_url ? (
          <Image
            source={{ uri: item.other_profile.avatar_url, cache: 'force-cache' }}
            style={styles.convoAvatar}
          />
        ) : (
          <View
            style={[styles.convoAvatar, styles.convoAvatarFallback, { backgroundColor: avatarBg }]}
          >
            <Text style={[styles.convoInitial, { color: text }]}>{initials}</Text>
          </View>
        )}

        <View style={styles.convoInfo}>
          <Text style={[styles.convoName, { color: text }]}>{name}</Text>
          {preview ? <Text style={[styles.convoPreview, { color: muted }]}>{preview}</Text> : null}
          {showAccept ? null : (
            <Text style={[styles.pendingLabel, { color: muted }]}>
              Waiting for @{item.other_profile.username} to accept
            </Text>
          )}
        </View>

        <View style={styles.convoRight}>{time}</View>
      </Pressable>

      {showAccept ? (
        <View style={[styles.actionArea, { borderTopColor: border }]}>
          <Text style={[styles.actionHint, { color: muted }]}>
            Allow this person to message you?
          </Text>
          <View style={styles.actionBtns}>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.acceptBtn,
                pressed && styles.pressed,
              ]}
              onPress={onAccept}
              accessibilityRole="button"
              accessibilityLabel={`Accept request from ${name}`}
            >
              <Text style={styles.acceptBtnText}>Accept</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { borderColor: colors.dangerText },
                pressed && styles.pressed,
              ]}
              onPress={onDeny}
              accessibilityRole="button"
              accessibilityLabel={`Deny request from ${name}`}
            >
              <Text style={[styles.actionBtnText, { color: colors.dangerText }]}>Deny</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { borderColor: colors.dangerText },
                pressed && styles.pressed,
              ]}
              onPress={onBlock}
              accessibilityRole="button"
              accessibilityLabel={`Block ${name}`}
            >
              <Text style={[styles.actionBtnText, { color: colors.dangerText }]}>Block</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

interface MessageRequestsScreenProps {
  onBack: () => void;
}

export default function MessageRequestsScreen({
  onBack,
}: MessageRequestsScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted, border, accentText } = themeColors(dark);
  const surface = dark ? COLORS.surfaceDark : COLORS.white;
  const iconSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);
  const avatarBg = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a10)
    : withAlpha(COLORS.offBlack, ALPHA.a08);

  const { requests, isLoading, refresh, accept, deny } = useMessages();
  const userId = useAuthStore((s) => s.user?.id);
  const insets = useSafeAreaInsets();

  const [openConvo, setOpenConvo] = React.useState<ConversationPreview | null>(null);

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: iconSurface, borderColor: border },
            pressed && styles.pressed,
          ]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <Text style={[styles.backArrow, { color: text }]}>‹</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerEyebrow, { color: accentText }]}>Inbox</Text>
          <Text style={[styles.headerTitle, { color: text }]}>Message requests</Text>
        </View>
        <View style={styles.backSpacer} />
      </View>

      <FlashList
        data={requests}
        keyExtractor={(item) => item.id}
        // The sheet runs to the bottom edge; keep the last row clear of the home indicator.
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + SPACE.s12 }]}
        renderItem={({ item }) => {
          // Only receivers (not the original requester) see accept/deny controls.
          const isReceiver = !item.is_requester;
          return (
            <RequestRow
              item={item}
              showAccept={isReceiver}
              onPress={() => setOpenConvo(item)}
              onAccept={() => accept(item.id)}
              onDeny={() =>
                Alert.alert(
                  'Deny request?',
                  `It leaves your requests. @${item.other_profile.username} won’t be told.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Deny', style: 'destructive', onPress: () => deny(item.id) },
                  ]
                )
              }
              onBlock={() =>
                Alert.alert(
                  `Block @${item.other_profile.username}?`,
                  'They won’t be able to message you, and the request goes.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Block',
                      style: 'destructive',
                      onPress: () => {
                        if (userId) useBlockStore.getState().block(userId, item.other_profile.id);
                      },
                    },
                  ]
                )
              }
              text={text}
              muted={muted}
              border={border}
              surface={surface}
              avatarBg={avatarBg}
            />
          );
        }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} {...refreshTint(dark)} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <ListState kind="empty" dark={dark} title="No requests" line="You’re all caught up." />
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
    // Shown in a page sheet, which already starts below the status bar.
    paddingTop: SPACE.s16,
    paddingHorizontal: SPACE.s20,
    paddingBottom: SPACE.s20,
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
  headerEyebrow: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACE.s2,
  },
  headerTitle: {
    fontSize: FONT_SIZE.f24,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l24,
  },
  backSpacer: {
    width: SIZE.z44,
    height: SIZE.z44,
  },
  listContent: {
    paddingHorizontal: SPACE.s20,
  },
  convoRow: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r20,
    marginBottom: SPACE.s8,
    overflow: 'hidden',
  },
  convoBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s14,
  },
  pressed: {
    opacity: ALPHA.a70,
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
    fontFamily: FONTS.regular,
  },
  convoRight: {
    alignItems: 'flex-end',
  },
  convoTime: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.regular,
  },
  actionArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s12,
    paddingBottom: SPACE.s14,
  },
  actionHint: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
    marginBottom: SPACE.s10,
  },
  actionBtns: {
    flexDirection: 'row',
    gap: SPACE.s8,
  },
  actionBtn: {
    flex: 1,
    minHeight: SIZE.z44,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  actionBtnText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
  acceptBtnText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.bold,
  },
  pendingLabel: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
  },
});
