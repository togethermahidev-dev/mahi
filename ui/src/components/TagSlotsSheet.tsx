import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import { noteInviteSent } from '@/lib/inviteAMate';
import type { InviteVia } from '@/lib/myInvites';
import { useAuthStore } from '@/store';
import KeyboardInset from '@/components/KeyboardInset';
import {
  cancelTagSlot,
  getTagSlots,
  inviteToTag,
  makeInviteLink,
  markInviteShared,
  searchTagPeople,
  type TagPerson,
  type TaggedUser,
} from '@/api';
import {
  inviteBlockedReason,
  isSlotRefusal,
  mergeSlots,
  personAction,
  shareAppUrl,
  slotErrorText,
  slotLabel,
  slotShareMessage,
  slotStateText,
  type ScreenSlot,
} from '@/lib/tagSlots';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  WAIT,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/lib/themeColors';
import { useAppTheme } from '@/hooks/useAppTheme';

type ShareTarget = 'whatsapp' | 'messages' | 'more';

const SHARE_TARGETS: { target: ShareTarget; label: string }[] = [
  { target: 'whatsapp', label: 'WhatsApp' },
  { target: 'messages', label: 'Messages' },
  // The phone's own sheet: Copy, Instagram and every other app.
  { target: 'more', label: 'More…' },
];

const emptySlot = (challengeId: string, over: Partial<ScreenSlot>): ScreenSlot => ({
  challenge_id: challengeId,
  kind: 'link',
  state: 'link_ready',
  user_id: null,
  username: null,
  display_name: null,
  avatar_url: null,
  token: null,
  code: null,
  url: null,
  expires_at: null,
  server_now: new Date().toISOString(),
  created_at: new Date().toISOString(),
  pending: true,
  ...over,
});

/**
 * The tag screen (flag `tag-slots`, owner 2026-10-03). Three slots at the top, each filled by a
 * friend you tag, an in-app invite for someone on Mahi who isn't your friend, or a link shared
 * the moment you tap. Each slot says where it's at, fresh from the server when the screen opens
 * and live while it stays open; your own taps show at once. Friends first: invites wait until
 * every friend you could tag is tagged (the server's rule too). The tag sheet is always dark.
 *
 * Closing (Done, ✕ or a swipe down) keeps everything: links and invites already exist.
 */
export default function TagSlotsSheet({
  visible,
  maxTags,
  initialFriends,
  onClose,
}: {
  visible: boolean;
  maxTags: number;
  initialFriends: TaggedUser[];
  onClose: (friends: TaggedUser[], slots: ScreenSlot[]) => void;
}): React.JSX.Element {
  const { dark, colors } = useAppTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const [friends, setFriends] = useState<TaggedUser[]>(initialFriends);
  const [slots, setSlots] = useState<ScreenSlot[]>([]);
  // Your friends (nothing typed), fresh each time the screen opens; null until read.
  const [friendList, setFriendList] = useState<TagPerson[] | null>(null);
  const [results, setResults] = useState<TagPerson[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The first read failed: say so, with Try again (bumping this reads again).
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadTry, setLoadTry] = useState(0);
  const pendingCount = useRef(0);

  const filled = friends.length + slots.length;
  const blocked = inviteBlockedReason({ filled, maxTags });

  const refreshSlots = useCallback(async () => {
    const { data, error } = await getTagSlots();
    if (error) reportError(error, { flow: 'tags', action: 'refreshSlots', level: 'warning' });
    if (data) setSlots((local) => mergeSlots(data, local));
  }, []);

  // Fresh on every open: slots and friends from the server, a loading state until both are in.
  useEffect(() => {
    if (!visible) return;
    setFriends(initialFriends);
    setSlots([]);
    setFriendList(null);
    setResults([]);
    setQuery('');
    setNotice(null);
    setLoadFailed(false);
    setLoaded(false);
    let stale = false;
    (async () => {
      const [slotRes, friendRes] = await Promise.all([getTagSlots(), searchTagPeople('', 100)]);
      if (stale) return;
      if (slotRes.error) reportError(slotRes.error, { flow: 'tags', action: 'loadSlots' });
      if (friendRes.error) reportError(friendRes.error, { flow: 'tags', action: 'loadFriends' });
      if (slotRes.error || friendRes.error) {
        setNotice('Couldn’t load your tags.');
        setLoadFailed(true);
      }
      setSlots(slotRes.data ?? []);
      setFriendList(friendRes.data ?? []);
      setLoaded(true);
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, loadTry]);

  // Live while open: someone joins, accepts, says not now — your slots read again.
  useEffect(() => {
    if (!visible || !userId) return;
    const channel = supabase
      .channel(`tag-slots:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tag_challenges',
          filter: `tagger_id=eq.${userId}`,
        },
        () => void refreshSlots()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible, userId, refreshSlots]);

  // Anyone on Mahi as you type (350ms after the last key).
  useEffect(() => {
    if (!visible) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let stale = false;
    const timer = setTimeout(async () => {
      const { data, error } = await searchTagPeople(q, 50);
      if (error) {
        reportError(error, {
          flow: 'tags',
          action: 'searchPeople',
          level: 'warning',
          extra: { queryLength: q.length },
        });
      }
      if (stale) return;
      setResults(data ?? []);
      setSearching(false);
    }, WAIT.search);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, visible]);

  const say = (text: string) => {
    haptic('warning');
    setNotice(text);
  };

  const close = () =>
    onClose(
      friends,
      slots.filter((s) => !s.pending)
    );

  const addPending = (over: Partial<ScreenSlot>): string => {
    pendingCount.current += 1;
    const tempId = `pending:${pendingCount.current}`;
    setSlots((list) => [...list, emptySlot(tempId, over)]);
    return tempId;
  };
  // A live read may already have brought the made slot in: keep one copy, ours.
  const replaceSlot = (id: string, over: Partial<ScreenSlot>) =>
    setSlots((list) =>
      list
        .filter(
          (s) =>
            !(over.challenge_id && s.challenge_id === over.challenge_id && s.challenge_id !== id)
        )
        .map((s) => (s.challenge_id === id ? { ...s, ...over } : s))
    );
  const dropSlot = (id: string) => setSlots((list) => list.filter((s) => s.challenge_id !== id));

  const tagFriend = (p: TagPerson) => {
    if (friends.some((f) => f.user_id === p.id)) {
      setFriends((list) => list.filter((f) => f.user_id !== p.id));
      return;
    }
    if (filled >= maxTags) return say(`All ${maxTags} tags used`);
    haptic('selection');
    setNotice(null);
    setFriends((list) => [
      ...list,
      {
        user_id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      },
    ]);
  };

  const sendTagInvite = async (p: TagPerson) => {
    if (blocked) return say(blocked);
    haptic('selection');
    setNotice(null);
    const tempId = addPending({
      kind: 'request',
      state: 'invite_sent',
      user_id: p.id,
      username: p.username,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
    });
    const { data, error } = await inviteToTag(p.id);
    if (error && !isSlotRefusal(error.message)) {
      reportError(error, { flow: 'tags', action: 'inviteToTag', extra: { targetUserId: p.id } });
    }
    if (error || !data) {
      dropSlot(tempId);
      return say(slotErrorText(error?.message ?? ''));
    }
    replaceSlot(tempId, { challenge_id: data.challenge_id, pending: false });
    track('tag_invite_sent', { challenge_id: data.challenge_id });
  };

  const invitePerson = (p: TagPerson) => {
    Alert.alert(
      `Send a tag request to @${p.username}?`,
      // Accepting no longer makes you follow each other (owner, 2026-10-08).
      'If they accept, they’ll have 48 hours to answer your tag.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send request', onPress: () => void sendTagInvite(p) },
      ]
    );
  };

  // One share; only a share sheet that closed with the link sent somewhere counts as shared.
  const share = async (slot: ScreenSlot, target: ShareTarget) => {
    if (!slot.url || !slot.code) return;
    const message = slotShareMessage(slot.url, slot.code);
    let shared = false;
    // How it really went: the share sheet when the app asked for isn't on this phone.
    let via: InviteVia = target === 'more' ? 'share' : target;
    try {
      if (target === 'more') {
        shared = (await Share.share({ message })).action === Share.sharedAction;
      } else {
        await Linking.openURL(
          shareAppUrl(target, message, Platform.OS === 'ios' ? 'ios' : 'android')
        );
        shared = true;
      }
    } catch {
      // The app isn't on this phone: the phone's own sheet instead.
      via = 'share';
      try {
        shared = (await Share.share({ message })).action === Share.sharedAction;
      } catch (e) {
        reportError(e, {
          flow: 'tags',
          action: 'shareLink',
          extra: { challengeId: slot.challenge_id, target },
        });
        return say('Couldn’t open sharing. Try again.');
      }
    }
    if (!shared) return;
    replaceSlot(slot.challenge_id, { state: 'shared' });
    noteInviteSent(slot.token, via);
    void markInviteShared(slot.challenge_id).then(({ error }) => {
      if (error) {
        reportError(error, {
          flow: 'tags',
          action: 'markInviteShared',
          level: 'warning',
          extra: { challengeId: slot.challenge_id },
        });
      }
    });
    track('invite_shared', { via: target, challenge_id: slot.challenge_id });
  };

  const shareNewLink = async (target: ShareTarget) => {
    if (blocked) return say(blocked);
    haptic('selection');
    setNotice(null);
    const tempId = addPending({ kind: 'link', state: 'link_ready' });
    const { data, error } = await makeInviteLink();
    if (error && !isSlotRefusal(error.message)) {
      reportError(error, { flow: 'tags', action: 'makeInviteLink' });
    }
    if (error || !data) {
      dropSlot(tempId);
      return say(slotErrorText(error?.message ?? ''));
    }
    const made = { ...data, pending: false };
    replaceSlot(tempId, made);
    await share(emptySlot(data.challenge_id, made), target);
  };

  // A link or a tag request may already be with someone: ask before taking it back (the bigger
  // × makes a stray tap likelier).
  const confirmRemove = (slot: ScreenSlot) => {
    const link = slot.kind === 'link';
    Alert.alert(
      link ? 'Take back this link?' : 'Take back this tag request?',
      link ? 'It stops working.' : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take back', style: 'destructive', onPress: () => void removeSlot(slot) },
      ]
    );
  };

  const removeSlot = async (slot: ScreenSlot) => {
    if (slot.pending) return;
    haptic('selection');
    dropSlot(slot.challenge_id);
    const { error } = await cancelTagSlot(slot.challenge_id);
    if (error) {
      if (!isSlotRefusal(error.message)) {
        reportError(error, {
          flow: 'tags',
          action: 'cancelSlot',
          extra: { challengeId: slot.challenge_id },
        });
      }
      // Not taken back after all (it may have just been posted with or joined): show it again.
      void refreshSlots();
      say(slotErrorText(error.message));
    }
  };

  const listed = query.trim() ? results : (friendList ?? []);

  return (
    // The system page sheet: swipe down (or ✕) closes; onRequestClose fires for both.
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={[styles.panel, { backgroundColor: colors.bg }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            Who are you holding accountable?
          </Text>
          <View style={styles.headerEnd}>
            <Text style={[styles.counter, { color: colors.muted }]}>
              {filled} of {maxTags}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: OFFSET.o8, right: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8 }}
              style={({ pressed }) => [styles.closeX, pressed && styles.pressed]}
              onPress={close}
            >
              <Text style={[styles.closeXText, { color: colors.muted }]}>×</Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.prompt, { color: colors.muted }]}>
          Pick {maxTags} friends you want to see show up on Mahi.
        </Text>

        {!loaded ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <>
            {slots.length > 0 ? (
              <View style={styles.slotRow}>
                {slots.map((slot) => {
                  if (slot) {
                    const linkIndex = slots
                      .filter((s) => s.kind === 'link')
                      .findIndex((s) => s.challenge_id === slot.challenge_id);
                    const canReshare =
                      slot.kind === 'link' &&
                      (slot.state === 'link_ready' || slot.state === 'shared');
                    return (
                      <SlotCircle
                        key={slot.challenge_id}
                        name={slotLabel(slot, Math.max(linkIndex, 0))}
                        state={
                          slot.pending && slot.kind === 'link'
                            ? 'Making link…'
                            : slotStateText(slot.state)
                        }
                        avatarUrl={slot.avatar_url}
                        initial={slot.username ? (slot.display_name ?? slot.username)[0] : '↗'}
                        busy={slot.pending}
                        onPress={
                          canReshare && !slot.pending ? () => share(slot, 'more') : undefined
                        }
                        onRemove={slot.pending ? undefined : () => confirmRemove(slot)}
                      />
                    );
                  }
                  return null;
                })}
              </View>
            ) : null}

            <View style={styles.shareBlock}>
              <Text style={[styles.shareLabel, { color: colors.muted }]}>
                {blocked ??
                  'Want to see someone else show up? Send a link. When they join, you’ll automatically follow each other.'}
              </Text>
              <View style={styles.shareRow}>
                {SHARE_TARGETS.map(({ target, label }) => (
                  <Pressable
                    key={target}
                    accessibilityRole="button"
                    accessibilityLabel={`Send a link by ${label}`}
                    accessibilityState={{ disabled: !!blocked }}
                    style={({ pressed }) => [
                      styles.shareButton,
                      blocked ? styles.shareButtonOff : null,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => shareNewLink(target)}
                  >
                    <Text style={styles.shareButtonText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {notice ? (
              <Text style={styles.notice} accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : null}
            {loadFailed ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setLoadTry((n) => n + 1)}
                style={({ pressed }) => [styles.retry, pressed && { opacity: ALPHA.a70 }]}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            ) : null}

            <TextInput
              style={[
                styles.search,
                {
                  color: colors.text,
                  backgroundColor: dark ? COLORS.surfaceDark2 : COLORS.surfaceLight,
                },
              ]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search friends or anyone on Mahi"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="search"
              clearButtonMode="while-editing"
              keyboardAppearance="dark"
            />

            <FlatList
              data={listed}
              numColumns={4}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={styles.list}
              contentContainerStyle={styles.peopleGrid}
              columnWrapperStyle={styles.peopleRow}
              ListEmptyComponent={
                searching ? null : (
                  <Text style={[styles.empty, { color: colors.muted }]}>
                    {query.trim()
                      ? 'No one found.'
                      : 'No accountability partners yet. Follow each other, or send a link.'}
                  </Text>
                )
              }
              renderItem={({ item }) => {
                const tagged = friends.some((f) => f.user_id === item.id);
                // Someone already in a slot (invited, joined, accepted) says where it's at.
                const inSlot = slots.find((s) => s.user_id === item.id);
                const { action, note } = inSlot
                  ? { action: 'none' as const, note: slotStateText(inSlot.state).toLowerCase() }
                  : personAction(item, tagged);
                return (
                  <PersonRow
                    person={item}
                    picked={tagged || !!inSlot}
                    note={note}
                    action={action}
                    onPress={() => {
                      if (action === 'tag' || action === 'untag') tagFriend(item);
                      else if (action === 'invite') invitePerson(item);
                    }}
                  />
                );
              }}
            />
          </>
        )}

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.done,
            { backgroundColor: colors.text },
            pressed && styles.pressed,
          ]}
          onPress={close}
        >
          <Text style={[styles.doneText, { color: colors.bg }]}>Done</Text>
        </Pressable>
        <KeyboardInset />
      </View>
    </Modal>
  );
}

function SlotCircle({
  name,
  state,
  avatarUrl,
  initial,
  empty,
  busy,
  onPress,
  onRemove,
}: {
  name: string;
  state: string;
  avatarUrl?: string | null;
  initial?: string;
  empty?: boolean;
  busy?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
}) {
  const { dark, colors } = useAppTheme();
  return (
    <View style={styles.slot}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `${name}, ${state}. Share again` : `${name}, ${state}`}
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => [
          styles.slotCircle,
          { backgroundColor: dark ? COLORS.surfaceDark2 : COLORS.surfaceLight },
          empty ? styles.slotCircleEmpty : null,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.text} />
        ) : avatarUrl ? (
          <Image source={{ uri: avatarUrl, cache: 'force-cache' }} style={styles.slotAvatar} />
        ) : empty ? null : (
          <Text style={[styles.slotInitial, { color: colors.text }]}>
            {(initial ?? '').toUpperCase()}
          </Text>
        )}
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          hitSlop={{ top: OFFSET.o12, right: OFFSET.o12, bottom: OFFSET.o12, left: OFFSET.o12 }}
          style={({ pressed }) => [styles.slotRemove, pressed && styles.pressed]}
          onPress={onRemove}
        >
          <Text style={styles.slotRemoveText}>×</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.slotName, { color: colors.text }]} numberOfLines={1}>
        {name}
      </Text>
      {state ? (
        <Text style={[styles.slotState, { color: colors.accentText }]} numberOfLines={1}>
          {state}
        </Text>
      ) : null}
    </View>
  );
}

function PersonRow({
  person,
  picked,
  note,
  action,
  onPress,
}: {
  person: TagPerson;
  picked: boolean;
  note: string | null;
  action: 'tag' | 'untag' | 'invite' | 'none';
  onPress: () => void;
}) {
  const { dark, colors } = useAppTheme();
  const display = person.display_name ?? person.username;
  const inactive = action === 'none';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        picked && styles.rowPicked,
        inactive && !picked && styles.rowOff,
        pressed && styles.pressed,
      ]}
      disabled={inactive}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${display}${note ? `, ${note}` : ''}`}
    >
      <View style={styles.personAvatarWrap}>
        {person.avatar_url ? (
          <Image
            source={{ uri: person.avatar_url, cache: 'force-cache' }}
            style={styles.rowAvatar}
          />
        ) : (
          <View
            style={[
              styles.rowAvatar,
              styles.rowAvatarFallback,
              { backgroundColor: dark ? COLORS.surfaceDark2 : COLORS.surfaceLight },
            ]}
          >
            <Text style={[styles.rowInitial, { color: colors.text }]}>
              {(display[0] ?? '?').toUpperCase()}
            </Text>
          </View>
        )}
        {action === 'untag' ? (
          <View
            style={[styles.gridCheck, { backgroundColor: colors.text, borderColor: colors.bg }]}
          >
            <Text style={[styles.gridCheckText, { color: colors.bg }]}>✓</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
        {display}
      </Text>
      <Text style={[styles.rowHandle, { color: colors.muted }]} numberOfLines={1}>
        {action === 'invite' ? 'Invite' : (note ?? `@${person.username}`)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: ALPHA.a70 },
  panel: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
    paddingHorizontal: SPACE.s20,
    paddingTop: SPACE.s20,
    paddingBottom: SPACE.s12,
    gap: SPACE.s12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    flex: 1,
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f17,
    fontFamily: FONTS.semiBold,
  },
  prompt: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
  },
  headerEnd: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s8 },
  counter: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
  },
  closeX: { width: SIZE.z28, height: SIZE.z28, alignItems: 'center', justifyContent: 'center' },
  closeXText: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.semiBold,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  slotRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: SPACE.s8 },
  slot: { width: SIZE.z88, alignItems: 'center', gap: SPACE.s4 },
  slotCircle: {
    width: SIZE.z56,
    height: SIZE.z56,
    borderRadius: RADIUS.r28,
    backgroundColor: COLORS.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  slotCircleEmpty: {
    backgroundColor: COLORS.bgDark,
    borderWidth: BORDER_WIDTH.w1_5,
    borderStyle: 'dashed',
    borderColor: withAlpha(COLORS.offWhite, ALPHA.a30),
  },
  slotAvatar: { width: SIZE.z56, height: SIZE.z56 },
  slotInitial: { color: COLORS.offWhite, fontSize: FONT_SIZE.f18, fontFamily: FONTS.semiBold },
  slotRemove: {
    position: 'absolute',
    top: 0,
    right: SPACE.s8,
    width: SIZE.z20,
    height: SIZE.z20,
    borderRadius: RADIUS.r10,
    backgroundColor: COLORS.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotRemoveText: { color: COLORS.offWhite, fontSize: FONT_SIZE.f11, fontFamily: FONTS.semiBold },
  slotName: { color: COLORS.offWhite, fontSize: FONT_SIZE.f12, fontFamily: FONTS.semiBold },
  slotState: { color: COLORS.accent, fontSize: FONT_SIZE.f11, fontFamily: FONTS.regular },
  shareBlock: {
    gap: SPACE.s8,
    paddingVertical: SPACE.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(COLORS.offWhite, ALPHA.a12),
  },
  shareLabel: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
  },
  shareRow: { flexDirection: 'row', gap: SPACE.s8 },
  shareButton: {
    flex: 1,
    paddingVertical: SPACE.s10,
    borderRadius: RADIUS.r50,
    backgroundColor: withAlpha(COLORS.offWhite, ALPHA.a10),
    alignItems: 'center',
  },
  shareButtonOff: { opacity: ALPHA.a35 },
  shareButtonText: { color: COLORS.offWhite, fontSize: FONT_SIZE.f13, fontFamily: FONTS.semiBold },
  notice: { color: COLORS.amber, fontSize: FONT_SIZE.f12, fontFamily: FONTS.regular },
  retry: { alignSelf: 'flex-start', minHeight: SIZE.z44, justifyContent: 'center' },
  retryText: { color: COLORS.offWhite, fontSize: FONT_SIZE.f15, fontFamily: FONTS.semiBold },
  search: {
    height: SIZE.z44,
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.regular,
    paddingHorizontal: SPACE.s14,
    borderRadius: RADIUS.r50,
    backgroundColor: withAlpha(COLORS.white, ALPHA.a08),
  },
  list: { flex: 1 },
  peopleGrid: { paddingVertical: SPACE.s8 },
  peopleRow: { justifyContent: 'flex-start' },
  empty: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingVertical: SPACE.s16,
  },
  row: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACE.s2,
    paddingVertical: SPACE.s8,
    gap: SPACE.s4,
  },
  rowPicked: { opacity: 1 },
  rowOff: { opacity: ALPHA.a40 },
  personAvatarWrap: { position: 'relative' },
  rowAvatar: { width: SIZE.z64, height: SIZE.z64, borderRadius: RADIUS.pill },
  rowAvatarFallback: {
    backgroundColor: COLORS.surfaceDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInitial: { color: COLORS.offWhite, fontSize: FONT_SIZE.f15, fontFamily: FONTS.semiBold },
  rowText: { flex: 1 },
  rowName: {
    maxWidth: SIZE.z80,
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  rowHandle: {
    maxWidth: SIZE.z80,
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  gridCheck: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: SIZE.z24,
    height: SIZE.z24,
    borderRadius: RADIUS.r12,
    backgroundColor: COLORS.offWhite,
    borderWidth: BORDER_WIDTH.w2,
    borderColor: COLORS.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCheckText: { color: COLORS.offBlack, fontSize: FONT_SIZE.f12, fontFamily: FONTS.bold },
  done: {
    backgroundColor: COLORS.offWhite,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s16,
    alignItems: 'center',
    marginTop: SPACE.s4,
  },
  doneText: { color: COLORS.offBlack, fontSize: FONT_SIZE.f16, fontFamily: FONTS.semiBold },
});
