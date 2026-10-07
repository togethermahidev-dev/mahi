import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
import { cancelInvite, getMyInvites, resendInvite } from '@/api/invites';
import { useAuthStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { inviteAMate, shareMateLink } from '@/lib/inviteAMate';
import {
  CANCEL_CONFIRM,
  applyCancel,
  applyResend,
  canCancel,
  inviteErrorText,
  inviteStatusText,
  inviteTitle,
  isInviteRefusal,
  reconcileInvite,
  resendButton,
  restoreInvite,
  type MyInvite,
  type ScreenInvite,
} from '@/lib/myInvites';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { themeColors } from '@/hooks/useAppTheme';
import { refreshTint } from '@/lib/themeColors';
import ListState from '@/components/ListState';
import { ProfileIcon } from '@/components/ScreenIcons';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  FONT_SIZE,
  ICON_SIZE,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
} from '@/constants/tokens';

interface MyInvitesSheetProps {
  visible: boolean;
  onClose: () => void;
  dark: boolean;
}

/**
 * "Your invites": the links you've sent and who joined from them, in a native page sheet (swipe
 * down or Android back to close). Invites expire and can be cancelled, so the list is never kept
 * on the phone: each open starts with a loading state, then the server's list. Joins arrive live.
 */
export default function MyInvitesSheet({
  visible,
  onClose,
  dark,
}: MyInvitesSheetProps): React.JSX.Element {
  const bg = dark ? COLORS.bgDark : COLORS.white;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* A Modal is its own native window: gesture-handler needs its own root here (a profile
          opened from a row swipes closed with a pan). The sheet mounts on open, so the list
          starts fresh each time. */}
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider style={{ backgroundColor: bg }}>
          <Sheet onClose={onClose} dark={dark} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Sheet({ onClose, dark }: Omit<MyInvitesSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const show = useToastStore((s) => s.show);

  const bg = dark ? COLORS.bgDark : COLORS.white;
  const { text, muted, border, accentText, dangerText } = themeColors(dark);
  const avatarBg = dark ? COLORS.surfaceDark : COLORS.offWhite;

  const [invites, setInvites] = useState<ScreenInvite[]>([]);
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // Server time minus phone time, so "Resend in 5h" counts on the server's clock.
  const [offset, setOffset] = useState(0);
  const now = useMinuteTick() + offset;
  // Links with a tap of yours on its way: a read that lands meanwhile keeps your tap on screen.
  const inFlight = useRef(new Set<string>());

  const load = useCallback(async (): Promise<boolean> => {
    const { data, error } = await getMyInvites();
    if (error || !data) {
      reportError(error ?? new Error('get_my_invites returned no data'), {
        flow: 'invites',
        action: 'loadMyInvites',
        level: 'warning',
      });
      // A list already on screen was read this open, so it stays; with none, say it failed.
      setPhase((p) => (p === 'ready' ? p : 'error'));
      return false;
    }
    const serverNow = Date.parse(data[0]?.server_now ?? '');
    if (Number.isFinite(serverNow)) setOffset(serverNow - Date.now());
    setInvites((shown) =>
      data.map((row) =>
        inFlight.current.has(row.token) ? (shown.find((s) => s.token === row.token) ?? row) : row
      )
    );
    setPhase('ready');
    return true;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live while open: someone joining from your link sends you an invite_joined notification
  // (invites themselves aren't in realtime). Back from the background, read again too: the
  // connection may have slept through a join.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-invites:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new: { type?: string } }) => {
          if (payload.new?.type === 'invite_joined') void load();
        }
      )
      .subscribe();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      supabase.removeChannel(channel);
      foreground.remove();
    };
  }, [userId, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    const ok = await load();
    setRefreshing(false);
    if (!ok) show('Couldn’t refresh. Check your connection.');
  };

  const retry = () => {
    setPhase('loading');
    void load();
  };

  const inviteMate = async () => {
    if (inviting) return;
    setInviting(true);
    try {
      if (await inviteAMate()) await load();
    } finally {
      setInviting(false);
    }
  };

  // A refusal or failure: the row goes back to how it was, and says why in plain words.
  const refused = (before: ScreenInvite, error: Error | null, action: string, rpc: string) => {
    const message = error?.message ?? '';
    const refusal = isInviteRefusal(message);
    if (!refusal) {
      reportError(error ?? new Error(`${rpc} returned no data`), {
        flow: 'invites',
        action,
        extra: { rpc },
      });
    }
    setInvites((list) => restoreInvite(list, before));
    haptic('warning');
    show(inviteErrorText(message));
    // A rule said no (they joined, it was cancelled elsewhere): show where it's really at.
    if (refusal) void load();
  };

  const resend = async (item: ScreenInvite) => {
    if (inFlight.current.has(item.token)) return;
    inFlight.current.add(item.token);
    haptic('selection');
    setInvites((list) => applyResend(list, item.token));
    const { data, error } = await resendInvite(item.token);
    inFlight.current.delete(item.token);
    if (error || !data) {
      refused(item, error, 'resendInvite', 'resend_invite');
      return;
    }
    setInvites((list) => reconcileInvite(list, data.invite));
    if (!data.resent) {
      show(inviteErrorText(data.reason ?? ''));
      return;
    }
    track('invite_resent', { kind: item.kind });
    // The same link again, now open for longer. Joining makes you follow each other, whether or
    // not a tag still comes with it, so the message for a mate is true for both kinds.
    await shareMateLink(data.invite.url, 'shareResentInvite');
  };

  const runCancel = async (item: ScreenInvite) => {
    if (inFlight.current.has(item.token)) return;
    inFlight.current.add(item.token);
    setInvites((list) => applyCancel(list, item.token));
    const { data, error } = await cancelInvite(item.token);
    inFlight.current.delete(item.token);
    if (error || !data) {
      refused(item, error, 'cancelInvite', 'cancel_invite');
      return;
    }
    setInvites((list) => reconcileInvite(list, data.invite));
    track('invite_cancelled', { kind: item.kind });
  };

  const cancel = (item: ScreenInvite) => {
    Alert.alert(CANCEL_CONFIRM.title, CANCEL_CONFIRM.message, [
      { text: CANCEL_CONFIRM.keep, style: 'cancel' },
      {
        text: CANCEL_CONFIRM.confirm,
        style: 'destructive',
        onPress: () => void runCancel(item),
      },
    ]);
  };

  const renderRow = ({ item }: { item: ScreenInvite }) => {
    const title = inviteTitle(item);
    const status = inviteStatusText(item, now);
    const button = resendButton(item, now);
    const cancellable = canCancel(item);
    const joined: MyInvite['joined'] = item.status === 'joined' ? item.joined : null;
    const ended = item.status === 'expired' || item.status === 'cancelled';

    const avatar = joined?.avatar_url ? (
      <Image source={{ uri: joined.avatar_url, cache: 'force-cache' }} style={styles.avatar} />
    ) : (
      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
        {joined ? (
          <Text style={[styles.avatarInitial, { color: text }]}>
            {title[0]?.toUpperCase() ?? '?'}
          </Text>
        ) : (
          <ProfileIcon size={ICON_SIZE.i20} color={muted} />
        )}
      </View>
    );

    return (
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.rowMain, joined && pressed && styles.pressed]}
          onPress={joined ? () => setProfileUserId(joined.id) : undefined}
          disabled={!joined}
          accessibilityRole={joined ? 'button' : 'text'}
          accessibilityLabel={`${title}. ${status}. Code ${item.code}`}
          accessibilityHint={joined ? 'Opens their profile' : undefined}
        >
          {avatar}
          <View style={styles.rowText}>
            <Text style={[styles.name, { color: ended ? muted : text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text
              style={[styles.status, { color: item.status === 'joined' ? accentText : muted }]}
              numberOfLines={1}
            >
              {status}
            </Text>
            {joined ? null : (
              <Text style={[styles.code, { color: muted }]} numberOfLines={1}>
                Code {item.code}
              </Text>
            )}
          </View>
        </Pressable>

        {button.kind !== 'none' || cancellable ? (
          <View style={styles.actions}>
            {button.kind === 'resend' ? (
              <Pressable
                style={({ pressed }) => [
                  styles.pill,
                  { borderColor: accentText },
                  pressed && styles.pressed,
                ]}
                onPress={() => void resend(item)}
                accessibilityRole="button"
                accessibilityLabel="Resend"
                accessibilityHint="Sends the same link again and keeps it open for longer"
              >
                <Text style={[styles.pillText, { color: accentText }]}>Resend</Text>
              </Pressable>
            ) : null}
            {button.kind === 'busy' ? (
              <View
                style={[styles.pill, { borderColor: border }]}
                accessible
                accessibilityLabel="Sending"
                accessibilityState={{ busy: true }}
              >
                <ActivityIndicator size="small" color={muted} />
              </View>
            ) : null}
            {button.kind === 'wait' ? (
              <View
                style={[styles.pill, { borderColor: border }]}
                accessible
                accessibilityRole="button"
                accessibilityLabel={button.label ?? undefined}
                accessibilityState={{ disabled: true }}
              >
                <Text style={[styles.pillText, { color: muted }]}>{button.label}</Text>
              </View>
            ) : null}
            {button.kind === 'limit' ? (
              <Text style={[styles.limit, { color: muted }]}>{button.label}</Text>
            ) : null}
            {cancellable ? (
              <Pressable
                style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
                onPress={() => cancel(item)}
                hitSlop={OFFSET.o8}
                accessibilityRole="button"
                accessibilityLabel="Cancel invite"
                accessibilityHint="The link will stop working"
              >
                <Text style={[styles.cancelText, { color: dangerText }]}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const header = (
    <View style={[styles.intro, { borderBottomColor: border }]}>
      <Text style={[styles.introLine, { color: muted }]}>
        When a mate joins from your link, you follow each other.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}
        onPress={() => void inviteMate()}
        disabled={inviting}
        accessibilityRole="button"
        accessibilityLabel="Invite a mate"
        accessibilityHint="Makes a link to share. When they join, you’ll follow each other."
        accessibilityState={{ busy: inviting }}
      >
        {inviting ? (
          <ActivityIndicator color={COLORS.offBlack} />
        ) : (
          <Text style={styles.inviteButtonText}>Invite a mate</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <>
      <View style={[styles.root, { backgroundColor: bg }]}>
        <View
          style={[styles.header, { borderBottomColor: border, paddingTop: insets.top + SPACE.s16 }]}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: border },
              pressed && styles.pressed,
            ]}
            hitSlop={OFFSET.o8}
          >
            <Text style={[styles.backArrow, { color: text }]}>{'‹'}</Text>
          </Pressable>
          <Text
            style={[styles.headerTitle, { color: text }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            Your invites
          </Text>
          <View style={styles.spacer} />
        </View>

        {phase === 'loading' ? (
          <ListState kind="loading" dark={dark} />
        ) : phase === 'error' ? (
          <ListState kind="error" dark={dark} title="Couldn’t load your invites" onAction={retry} />
        ) : invites.length === 0 ? (
          <ListState
            kind="empty"
            dark={dark}
            title="No invites yet"
            line="Send a mate a link. When they join, you’ll follow each other."
            actionLabel={inviting ? undefined : 'Invite a mate'}
            onAction={() => void inviteMate()}
          />
        ) : (
          <FlashList
            data={invites}
            keyExtractor={(item) => item.token}
            extraData={now}
            renderItem={renderRow}
            ListHeaderComponent={header}
            contentContainerStyle={{ ...styles.listContent, paddingBottom: insets.bottom }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                {...refreshTint(dark)}
              />
            }
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: border }]} />
            )}
          />
        )}
      </View>

      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  spacer: {
    width: SIZE.z36,
    height: SIZE.z36,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l22,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
  },
  intro: {
    paddingVertical: SPACE.s16,
    gap: SPACE.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  introLine: {
    fontSize: FONT_SIZE.f13,
    lineHeight: LINE_HEIGHT.l18,
    fontFamily: FONTS.regular,
  },
  // The app's one main-button style (ListState's): accent pill, dark words.
  inviteButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: SIZE.z44,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACE.s24,
  },
  inviteButtonText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  listContent: {
    paddingHorizontal: SPACE.s20,
  },
  row: {
    paddingVertical: SPACE.s12,
    gap: SPACE.s10,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
  },
  avatar: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.bold,
  },
  rowText: {
    flex: 1,
    gap: SPACE.s2,
  },
  name: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
  },
  status: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
  },
  code: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f12,
  },
  // Under the words, lined up with them (past the avatar).
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACE.s12,
    marginLeft: SIZE.z44 + SPACE.s12,
  },
  pill: {
    minHeight: SIZE.z32,
    minWidth: SIZE.z80,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s6,
  },
  pillText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.bold,
  },
  limit: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
  },
  cancel: {
    minHeight: SIZE.z32,
    justifyContent: 'center',
    paddingHorizontal: SPACE.s4,
  },
  cancelText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.bold,
  },
  separator: {
    height: SIZE.z1,
  },
});
