import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Modal, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { useNotifications } from '@/hooks/useNotifications';
import { useBlockStore, useTagStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { getTagInviteRows, respondTagInvite, type NotificationWithActor } from '@/api';
import { notificationText } from '@/lib/notificationText';
import { relativeTime } from '@/lib/relativeTime';
import { slotErrorText, tagInviteState } from '@/lib/tagSlots';
import { track } from '@/lib/analytics';
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
  withAlpha,
} from '@/constants/tokens';

interface NotificationsScreenProps {
  visible: boolean;
  onClose: () => void;
  onOpenPost: (postId: string) => void;
  onOpenProfile: (userId: string) => void;
}

/** Where an in-app invite to you is at; 'loading' until the server has said. */
type InviteState = 'loading' | 'open' | 'accepted' | 'declined' | 'ended';

const INVITE_STATE_TEXT: Record<Exclude<InviteState, 'loading' | 'open'>, string> = {
  accepted: 'Accepted — you’re friends now',
  declined: 'Not now',
  ended: 'This invite has ended',
};

export default function NotificationsScreen({
  visible,
  onClose,
  onOpenPost,
  onOpenProfile,
}: NotificationsScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted } = themeColors(dark);
  const { border } = themeColors(dark);
  const avatarBg = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a10)
    : withAlpha(COLORS.offBlack, ALPHA.a08);

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

  // In-app invites ("@sam wants to tag you"): read where each is at, fresh, every time the list
  // shows them. Buttons appear only once the server has answered.
  const [inviteStates, setInviteStates] = useState<Record<string, InviteState>>({});
  const inviteIds = useMemo(
    () =>
      filteredItems
        .filter((n) => n.type === 'tag_invite' && n.challenge_id)
        .map((n) => n.challenge_id as string),
    [filteredItems]
  );
  const inviteKey = inviteIds.join(',');
  useEffect(() => {
    if (!visible || inviteIds.length === 0) return;
    let stale = false;
    setInviteStates((s) => {
      const next = { ...s };
      for (const id of inviteIds) if (!next[id]) next[id] = 'loading';
      return next;
    });
    (async () => {
      const { data } = await getTagInviteRows(inviteIds);
      if (stale || !data) return;
      const now = Date.now();
      setInviteStates((s) => {
        const next = { ...s };
        for (const id of inviteIds) {
          const row = data.find((r) => r.id === id);
          // A row you can no longer read has gone (blocked, deleted): the invite has ended.
          next[id] = row ? tagInviteState(row, now) : 'ended';
        }
        return next;
      });
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, inviteKey]);

  // Your answer shows at once; if the server says no, it goes back (or ends) with a reason.
  const answerInvite = async (challengeId: string, accept: boolean) => {
    setInviteStates((s) => ({ ...s, [challengeId]: accept ? 'accepted' : 'declined' }));
    const { error } = await respondTagInvite(challengeId, accept);
    if (error) {
      const ended = error.message.includes('no longer open');
      setInviteStates((s) => ({ ...s, [challengeId]: ended ? 'ended' : 'open' }));
      useToastStore.getState().show(slotErrorText(error.message));
      return;
    }
    track('tag_invite_answered', { accepted: accept });
    // A yes can land a tag at once: the camera shows it.
    if (accept) void useTagStore.getState().syncOpenTags();
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

              const caption = notificationText(item.type, item.actor.username);

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
                    {item.type === 'tag_invite' && item.challenge_id ? (
                      <InviteAnswer
                        state={inviteStates[item.challenge_id] ?? 'loading'}
                        text={text}
                        muted={muted}
                        border={border}
                        onAnswer={(accept) => answerInvite(item.challenge_id as string, accept)}
                      />
                    ) : null}
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

function InviteAnswer({
  state,
  text,
  muted,
  border,
  onAnswer,
}: {
  state: InviteState;
  text: string;
  muted: string;
  border: string;
  onAnswer: (accept: boolean) => void;
}) {
  if (state === 'loading') {
    return <ActivityIndicator color={muted} style={styles.inviteLoading} />;
  }
  if (state !== 'open') {
    return <Text style={[styles.inviteDone, { color: muted }]}>{INVITE_STATE_TEXT[state]}</Text>;
  }
  return (
    <View style={styles.inviteButtons}>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.inviteAccept, pressed && styles.pressed]}
        onPress={() => onAnswer(true)}
      >
        <Text style={styles.inviteAcceptText}>Accept</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.inviteLater,
          { borderColor: border },
          pressed && styles.pressed,
        ]}
        onPress={() => onAnswer(false)}
      >
        <Text style={[styles.inviteLaterText, { color: text }]}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: ALPHA.a70,
  },
  inviteLoading: {
    alignSelf: 'flex-start',
    marginTop: SPACE.s6,
  },
  inviteDone: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
    marginTop: SPACE.s4,
  },
  inviteButtons: {
    flexDirection: 'row',
    gap: SPACE.s8,
    marginTop: SPACE.s8,
  },
  inviteAccept: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s6,
    paddingHorizontal: SPACE.s16,
  },
  inviteAcceptText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
  inviteLater: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s6,
    paddingHorizontal: SPACE.s16,
  },
  inviteLaterText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
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
    fontFamily: FONTS.regular,
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
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l18,
  },
  rowTime: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.regular,
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
    fontFamily: FONTS.regular,
  },
});
