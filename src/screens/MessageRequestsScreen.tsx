import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { useMessages } from '@/hooks/useMessages';
import { useAuthStore } from '@/store';
import ConversationScreen from '@/screens/ConversationScreen';
import type { ConversationPreview } from '@/api';
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
    <View style={[styles.convoRow, { borderBottomColor: border }]}>
      <Pressable
        style={({ pressed }) => [styles.convoBody, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Message request from ${name}`}
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

        <View style={styles.convoInfo}>
          <Text style={[styles.convoName, { color: text }]}>{name}</Text>
          {preview ? <Text style={[styles.convoPreview, { color: muted }]}>{preview}</Text> : null}
        </View>

        {showAccept ? null : (
          <View style={styles.convoRight}>
            {time}
            <Text style={[styles.pendingLabel, { color: muted }]}>Pending</Text>
          </View>
        )}
      </Pressable>

      {showAccept ? (
        <View style={styles.convoRight}>
          {time}
          <View style={styles.actionBtns}>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { borderColor: text },
                pressed && styles.pressed,
              ]}
              onPress={onAccept}
              accessibilityRole="button"
              accessibilityLabel={`Accept request from ${name}`}
            >
              <Text style={[styles.actionBtnText, { color: text }]}>Accept</Text>
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
  const { muted } = themeColors(dark);
  const { border } = themeColors(dark);

  const { requests, isLoading, refresh, accept, deny } = useMessages();
  const userId = useAuthStore((s) => s.user?.id);
  const insets = useSafeAreaInsets();

  const [openConvo, setOpenConvo] = React.useState<ConversationPreview | null>(null);

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.backBtn,
            { borderColor: muted },
            pressed && styles.pressed,
          ]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <Text style={[styles.backArrow, { color: text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: text }]}>Requests</Text>
        <View style={styles.backSpacer} />
      </View>

      <FlashList
        data={requests}
        keyExtractor={(item) => item.id}
        // The sheet runs to the bottom edge; keep the last row clear of the home indicator.
        contentContainerStyle={{ paddingBottom: insets.bottom }}
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
                  `The request from @${item.other_profile.username} and its messages will be deleted.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Deny', style: 'destructive', onPress: () => deny(item.id) },
                  ]
                )
              }
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
              <Text style={[styles.placeholderTitle, { color: text }]}>No requests</Text>
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
    // Shown in a page sheet, which already starts below the status bar.
    paddingTop: SPACE.s16,
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
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l22,
  },
  headerTitle: {
    flex: 1,
    fontSize: FONT_SIZE.f24,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  backSpacer: {
    width: SIZE.z36,
    marginLeft: SPACE.s12,
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
    gap: SPACE.s6,
  },
  convoTime: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.regular,
  },
  actionBtns: {
    gap: SPACE.s5,
  },
  actionBtn: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s12,
    paddingVertical: SPACE.s4,
  },
  actionBtnText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
  },
  pendingLabel: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
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
    fontFamily: FONTS.regular,
  },
});
