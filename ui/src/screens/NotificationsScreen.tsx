import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { refreshTint } from '@/lib/themeColors';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore, useBlockStore, useTagStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { getTagInviteRows, respondTagInvite, type NotificationWithActor } from '@/api';
import ListState from '@/components/ListState';
import {
  notificationAction,
  notificationSections,
  notificationTarget,
  notificationText,
  type NotificationListItem,
  type NotificationTarget,
} from '@/lib/notificationText';
import { relativeTime } from '@/lib/relativeTime';
import { msLeft } from '@/lib/countdown';
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
  /** A row about a post: open it full screen (with its comments for a comment row). */
  onOpenPost: (ownerId: string, postId: string, comments: boolean) => void;
  onOpenProfile: (userId: string) => void;
  /** An open tag: go to the camera to answer it. */
  onOpenCamera: () => void;
  /** The sheet has finished sliding away (iPhone), so another full-screen view can open. */
  onDismissed?: () => void;
}

/** Where an in-app invite to you is at; 'loading' until the server has said. */
type InviteState = 'loading' | 'open' | 'accepted' | 'declined' | 'ended';

const INVITE_STATE_TEXT: Record<Exclude<InviteState, 'loading' | 'open'>, string> = {
  accepted: 'Accepted. You’re friends now.',
  declined: 'Not now',
  ended: 'That invite has ended.',
};

/**
 * What Accept does, under an open tag request. True whether or not their post exists yet: the
 * 48 hours start once it does (respond_tag_invite → start_tag).
 */
const ACCEPT_LINE = 'Accept and you’re friends. You’ll have 48 hours to answer their tag.';

/** Read out with each row: where a tap goes. */
function targetHint(target: NotificationTarget, username: string): string {
  if (target.to === 'camera') return 'Opens the camera';
  if (target.to === 'post') {
    return target.comments ? 'Opens the post and its comments' : 'Opens the post';
  }
  return `Opens @${username}’s profile`;
}

export default function NotificationsScreen({
  visible,
  onClose,
  onOpenPost,
  onOpenProfile,
  onOpenCamera,
  onDismissed,
}: NotificationsScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted } = themeColors(dark);
  const { border } = themeColors(dark);
  const surface = dark ? COLORS.surfaceDark : COLORS.white;
  const iconSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);
  const avatarBg = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a10)
    : withAlpha(COLORS.offBlack, ALPHA.a08);

  const { items, isLoading, failed, refresh, markRead, markAllRead } = useNotifications();
  const myId = useAuthStore((s) => s.user?.id);
  const openTags = useTagStore((s) => s.openTags);
  const serverOffsetMs = useTagStore((s) => s.serverOffsetMs);
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
  // Read fresh each time the list opens.
  useEffect(() => {
    if (visible) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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

  // A tag row is still open while its tag (or, without one, a tag from the same person) has time.
  const tagOpen = (n: NotificationWithActor) =>
    n.type === 'tag' &&
    openTags.some(
      (t) =>
        (n.challenge_id ? t.challenge_id === n.challenge_id : t.tagger_id === n.actor_id) &&
        msLeft(t.expires_at, serverOffsetMs) > 0
    );
  const needsAnswer = (n: NotificationWithActor) =>
    tagOpen(n) ||
    (n.type === 'tag_invite' && !!n.challenge_id && inviteStates[n.challenge_id] === 'open');

  const listItems = notificationSections(filteredItems, needsAnswer);

  const renderRow = (item: NotificationWithActor) => {
    const name = item.actor.display_name ?? item.actor.username;
    const initials = name[0].toUpperCase();
    const username = item.actor.username;
    const caption = notificationText(item.type, username);
    const time = relativeTime(item.created_at);
    const target = notificationTarget(item, myId ?? '', tagOpen(item));
    const action = notificationAction(target);
    const inviteState =
      item.type === 'tag_invite' && item.challenge_id
        ? (inviteStates[item.challenge_id] ?? 'loading')
        : null;

    // The @name in semibold, the rest regular; the words themselves are unchanged.
    const handle = `@${username}`;
    const at = caption.indexOf(handle);

    const handleAvatarPress = () => {
      markRead(item.id);
      onOpenProfile(item.actor_id);
      onClose();
    };

    const handleContentPress = () => {
      markRead(item.id);
      if (target.to === 'post') onOpenPost(target.ownerId, target.postId, target.comments);
      else if (target.to === 'camera') onOpenCamera();
      else onOpenProfile(target.userId);
      onClose();
    };

    return (
      <View style={[styles.row, { backgroundColor: surface, borderColor: border }]}>
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
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
              <Text style={[styles.avatarInitials, { color: text }]}>{initials}</Text>
            </View>
          )}
        </Pressable>

        {/* The row's text and its Accept / Not now are siblings, so a screen reader reaches each. */}
        <View style={styles.rowText}>
          <Pressable
            style={({ pressed }) => [styles.rowContent, pressed && styles.pressed]}
            onPress={handleContentPress}
            accessibilityRole="button"
            accessibilityLabel={`${caption}. ${time}${item.is_read === false ? '. Unread' : ''}`}
            accessibilityHint={targetHint(target, username)}
          >
            <Text style={[styles.rowCaption, { color: text }]} numberOfLines={2}>
              {at >= 0 ? (
                <>
                  {caption.slice(0, at)}
                  <Text style={styles.rowName}>{handle}</Text>
                  {caption.slice(at + handle.length)}
                </>
              ) : (
                caption
              )}
            </Text>
            <View style={styles.rowMeta}>
              <Text style={[styles.rowTime, { color: muted }]}>{time}</Text>
              <Text style={[styles.rowAction, { color: muted }]}>{action}</Text>
            </View>
          </Pressable>
          {inviteState && item.challenge_id ? (
            <InviteAnswer
              state={inviteState}
              username={username}
              text={text}
              muted={muted}
              border={border}
              onAnswer={(accept) => answerInvite(item.challenge_id as string, accept)}
            />
          ) : null}
        </View>

        <View style={styles.rowEnd}>
          {item.is_read === false ? <View style={styles.unreadDot} /> : null}
          <Text style={[styles.rowChevron, { color: muted }]} accessibilityElementsHidden>
            ›
          </Text>
        </View>
      </View>
    );
  };

  return (
    // Page sheet: slides up, and a swipe down closes it (which calls onRequestClose).
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      onDismiss={onDismissed}
    >
      <View style={[styles.root, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: iconSurface, borderColor: border },
              pressed && styles.pressed,
            ]}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
          >
            <Text style={[styles.backArrow, { color: text }]}>‹</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerName, { color: text }]} numberOfLines={1}>
              Notifications
            </Text>
            <Text style={[styles.headerLine, { color: muted }]}>Your activity history</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {/* Notification list: what needs your answer first, then the rest. */}
        {isLoading ? (
          <ListState kind="loading" dark={dark} />
        ) : failed ? (
          <ListState
            kind="error"
            dark={dark}
            title="Couldn’t load your notifications"
            onAction={() => void refresh()}
          />
        ) : (
          <FlashList
            data={listItems}
            keyExtractor={(entry) => (entry.kind === 'row' ? entry.item.id : entry.title)}
            getItemType={(entry) => entry.kind}
            extraData={inviteStates}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + SPACE.s12 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                {...refreshTint(dark)}
              />
            }
            renderItem={({ item: entry }: { item: NotificationListItem<NotificationWithActor> }) =>
              entry.kind === 'header' ? (
                <Text style={[styles.sectionLabel, { color: muted }]} accessibilityRole="header">
                  {entry.title}
                </Text>
              ) : (
                renderRow(entry.item)
              )
            }
            ListEmptyComponent={
              <ListState
                kind="empty"
                dark={dark}
                title="Nothing here yet"
                line="Tags, likes and comments from friends show up here."
              />
            }
          />
        )}
      </View>
    </Modal>
  );
}

function InviteAnswer({
  state,
  username,
  text,
  muted,
  border,
  onAnswer,
}: {
  state: InviteState;
  username: string;
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
  const slop = { top: OFFSET.o4, bottom: OFFSET.o4, left: OFFSET.o4, right: OFFSET.o4 };
  return (
    <View>
      <Text style={[styles.inviteDone, { color: muted }]}>{ACCEPT_LINE}</Text>
      <View style={styles.inviteButtons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Accept @${username}’s tag request`}
          hitSlop={slop}
          style={({ pressed }) => [styles.inviteAccept, pressed && styles.pressed]}
          onPress={() => onAnswer(true)}
        >
          <Text style={styles.inviteAcceptText}>Accept</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Not now, @${username}’s tag request`}
          hitSlop={slop}
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
    minHeight: SIZE.z36,
    justifyContent: 'center',
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
    minHeight: SIZE.z36,
    justifyContent: 'center',
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
    paddingBottom: SPACE.s20,
    paddingHorizontal: SPACE.s20,
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
  headerSpacer: {
    width: SIZE.z44,
    height: SIZE.z44,
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l22,
  },
  headerCopy: {
    flex: 1,
  },
  headerLine: {
    marginTop: SPACE.s2,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
  },
  headerName: {
    fontSize: FONT_SIZE.f24,
    lineHeight: LINE_HEIGHT.l24,
    fontFamily: FONTS.bold,
  },
  listContent: {
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s12,
    flexGrow: 1,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    paddingHorizontal: SPACE.s4,
    paddingTop: SPACE.s16,
    paddingBottom: SPACE.s8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s16,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r20,
    marginBottom: SPACE.s8,
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
  },
  rowContent: {
    gap: SPACE.s2,
  },
  rowCaption: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l18,
  },
  rowName: {
    fontFamily: FONTS.semiBold,
  },
  rowTime: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.regular,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
  },
  rowAction: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.semiBold,
  },
  rowEnd: {
    alignItems: 'center',
    gap: SPACE.s8,
  },
  rowChevron: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l22,
  },
  unreadDot: {
    width: SIZE.z8,
    height: SIZE.z8,
    borderRadius: RADIUS.r4,
    backgroundColor: COLORS.accent,
  },
});
