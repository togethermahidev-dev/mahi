import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { matchContacts } from '@/api/contacts';
import type { MateInvite } from '@/api/tagSlots';
import { useAuthStore } from '@/store';
import { useFollowStore } from '@/store/followStore';
import { followErrorText } from '@/lib/followBack';
import { useToastStore } from '@/store/toastStore';
import { loadContacts, readDeviceContacts } from '@/lib/contactsModule';
import {
  LIVE_FOLLOW_CAP,
  buildMatchPlan,
  buildRows,
  contactsAccess,
  findMatesView,
  followLabel,
  isMatchRefusal,
  matchErrorText,
  smsInviteUrl,
  type ContactsAccess,
  type DeviceContact,
  type FindMatesRow,
  type InviteContact,
  type MatchPhase,
  type MatchedAccount,
} from '@/lib/contactMatch';
import { discardUnsentLink, inviteAMate, makeMateLink, noteInviteSent } from '@/lib/inviteAMate';
import { INVITE_BUTTON, mateInviteMessage } from '@/lib/tagSlots';
import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { themeColors } from '@/hooks/useAppTheme';
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

interface FindMatesSheetProps {
  visible: boolean;
  onClose: () => void;
  dark: boolean;
  /** 'welcome': the step right after sign-up, full screen with "Not now". Else a page sheet. */
  mode?: 'sheet' | 'welcome';
}

/**
 * "Find friends in your contacts": who in your contacts is on Mahi (follow them), and everyone else (invite them
 * by text). Shown only on builds with expo-contacts (build 13+; no switch)
 * (useContactsFinder). Contacts and matches can change, so nothing is kept on the phone: each open
 * asks the phone and the server again, with a loading state first.
 */
export default function FindMatesSheet({
  visible,
  onClose,
  dark,
  mode = 'sheet',
}: FindMatesSheetProps): React.JSX.Element {
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const welcome = mode === 'welcome';
  return (
    <Modal
      visible={visible}
      animationType={welcome ? 'fade' : 'slide'}
      presentationStyle={welcome ? 'fullScreen' : 'pageSheet'}
      onRequestClose={onClose}
      statusBarTranslucent={welcome}
    >
      {/* Its own native window: gesture-handler needs its own root (a profile opened from a row
          swipes closed with a pan). It mounts on open, so every open starts fresh. */}
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider style={{ backgroundColor: bg }}>
          <FindMates onClose={onClose} dark={dark} welcome={welcome} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function FindMates({
  onClose,
  dark,
  welcome,
}: {
  onClose: () => void;
  dark: boolean;
  welcome: boolean;
}) {
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const show = useToastStore((s) => s.show);
  const followingByMe = useFollowStore((s) => s.followingByMe);
  const followsMe = useFollowStore((s) => s.followsMe);
  const requestedByMe = useFollowStore((s) => s.requestedByMe);

  const bg = dark ? COLORS.bgDark : COLORS.white;
  const { text, muted, border, accentText } = themeColors(dark);
  const avatarBg = dark ? COLORS.surfaceDark : COLORS.offWhite;
  const inputBg = dark ? COLORS.surfaceDark : COLORS.surfaceLight2;
  const cardBg = dark ? COLORS.surfaceDark : COLORS.surfaceLight;

  const [access, setAccess] = useState<ContactsAccess | null>(null);
  const [phase, setPhase] = useState<MatchPhase>('idle');
  const [failure, setFailure] = useState('');
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [matches, setMatches] = useState<MatchedAccount[]>([]);
  const [idsByHash, setIdsByHash] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState('');
  const [asking, setAsking] = useState(false);
  const [linking, setLinking] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  // Contacts whose text was opened in Messages. Opening it doesn't mean it was sent, so the row
  // says "Text opened", and a second tap opens the same link again rather than making a new one
  // (walkthrough 2026-10-07). Kept only while the sheet is open.
  const [invited, setInvited] = useState<Set<string>>(() => new Set());
  const linkFor = useRef(new Map<string, MateInvite>());
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const live = useRef(true);
  const matchIds = useRef<string[]>([]);
  // The permission as last read, and whether a look is running: the phone's question and coming
  // back to the app can both say "granted", and one look must not become two (10 an hour).
  const accessNow = useRef<ContactsAccess | null>(null);
  const looking = useRef(false);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // Read the phone's contacts, hash them, ask the server who's on Mahi. Fresh every time.
  const load = useCallback(async () => {
    if (looking.current) return;
    looking.current = true;
    setPhase('loading');
    try {
      const list = await readDeviceContacts();
      if (!list) throw new Error('expo-contacts is not in this build');
      const plan = await buildMatchPlan(list, (v) =>
        digestStringAsync(CryptoDigestAlgorithm.SHA256, v)
      );
      const byId = new Map<string, MatchedAccount>();
      for (const batch of plan.batches) {
        const { data, error } = await matchContacts(batch);
        if (error || !data) {
          const message = error?.message ?? '';
          if (!isMatchRefusal(message)) {
            reportError(error ?? new Error('match_contacts returned no data'), {
              flow: 'contacts',
              action: 'matchContacts',
              extra: { rpc: 'match_contacts', hashes: batch.length },
            });
          }
          if (live.current) {
            setFailure(message);
            setPhase('error');
          }
          return;
        }
        for (const m of data) {
          const seen = byId.get(m.id);
          byId.set(
            m.id,
            seen ? { ...m, matched_hashes: [...seen.matched_hashes, ...m.matched_hashes] } : m
          );
        }
      }
      const found = [...byId.values()];
      // The server's follow state is the truth for these people; the follow button starts from it.
      useFollowStore.setState((s) => ({
        followingByMe: {
          ...s.followingByMe,
          ...Object.fromEntries(found.map((m) => [m.id, m.is_following])),
        },
        followsMe: {
          ...s.followsMe,
          ...Object.fromEntries(found.map((m) => [m.id, m.follows_you])),
        },
        requestedByMe: {
          ...s.requestedByMe,
          ...Object.fromEntries(found.map((m) => [m.id, m.requested === true])),
        },
        privateById: {
          ...s.privateById,
          ...Object.fromEntries(found.map((m) => [m.id, m.is_private === true])),
        },
      }));
      track('contacts_matched', { count_on_mahi: found.length, count_total: list.length });
      if (!live.current) return;
      matchIds.current = found.map((m) => m.id);
      setContacts(list);
      setMatches(found);
      setIdsByHash(plan.contactIdsByHash);
      setPhase('ready');
    } catch (e) {
      reportError(e, { flow: 'contacts', action: 'readContacts' });
      if (live.current) {
        setFailure('');
        setPhase('error');
      }
    } finally {
      looking.current = false;
    }
  }, []);

  // A move to "granted" starts the first look. A no said on this open stays a no until Settings
  // changes it, even where the phone would let Mahi ask again.
  const applyAccess = useCallback(
    (next: ContactsAccess) => {
      const before = accessNow.current;
      const shown = before === 'denied' && next === 'ask' ? 'denied' : next;
      accessNow.current = shown;
      setAccess(shown);
      if (shown === 'granted' && before !== 'granted') void load();
    },
    [load]
  );

  // Where the permission is at; read again when back from the phone's Settings.
  const checkAccess = useCallback(async () => {
    const sdk = loadContacts();
    if (!sdk) {
      applyAccess('denied');
      return;
    }
    try {
      const next = contactsAccess(await sdk.getPermissionsAsync());
      if (live.current) applyAccess(next);
    } catch (e) {
      reportError(e, { flow: 'contacts', action: 'getPermissions', level: 'warning' });
      if (live.current && accessNow.current === null) applyAccess('ask');
    }
  }, [applyAccess]);

  useEffect(() => {
    void checkAccess();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkAccess();
    });
    return () => sub.remove();
  }, [checkAccess]);

  // Follows change elsewhere (a follow back, a profile): re-read these people's state while open.
  useEffect(() => {
    if (!userId) return;
    return useFollowStore.getState().subscribeToFollows(userId, userId, () => {
      for (const id of matchIds.current.slice(0, LIVE_FOLLOW_CAP)) {
        void useFollowStore.getState().loadFollowData(userId, id);
      }
    });
  }, [userId]);

  const ask = async () => {
    const sdk = loadContacts();
    if (!sdk || asking) return;
    setAsking(true);
    try {
      const answer = await sdk.requestPermissionsAsync();
      track('contacts_permission', { granted: answer.granted });
      if (live.current) applyAccess(answer.granted ? 'granted' : 'denied');
    } catch (e) {
      reportError(e, { flow: 'contacts', action: 'requestPermissions' });
      show('Couldn’t ask for your contacts. Try again.');
    } finally {
      if (live.current) setAsking(false);
    }
  };

  const inviteByLink = async () => {
    if (linking) return;
    setLinking(true);
    try {
      await inviteAMate();
    } finally {
      if (live.current) setLinking(false);
    }
  };

  const follow = async (account: MatchedAccount) => {
    if (!userId) return;
    haptic('selection');
    const { error } = await useFollowStore.getState().toggleFollow(userId, account.id);
    if (error) {
      reportError(error, {
        flow: 'follows',
        action: 'followFromContacts',
        extra: { rpc: 'set_following' },
      });
      show(followErrorText(error.message, 'Couldn’t update that follow. Try again.'));
    }
  };

  const invite = async (contact: InviteContact) => {
    if (invitingId) return;
    setInvitingId(contact.id);
    haptic('selection');
    try {
      const earlier = linkFor.current.get(contact.id);
      const link = earlier ?? (await makeMateLink());
      if (!link) return;
      const sms = smsInviteUrl(
        contact.phone,
        mateInviteMessage(link.url),
        Platform.OS === 'ios' ? 'ios' : 'android'
      );
      try {
        await Linking.openURL(sms);
        track('invite_shared', { via: 'messages' });
        if (!earlier) {
          noteInviteSent(link.token, 'contact', contact.name, contact.phone);
          linkFor.current.set(contact.id, link);
        }
        if (live.current) setInvited((s) => new Set(s).add(contact.id));
      } catch (e) {
        reportError(e, { flow: 'invites', action: 'openMessagesInvite' });
        if (!earlier) discardUnsentLink(link.token);
        show('Couldn’t open your messages app. Try again.');
      }
    } finally {
      if (live.current) setInvitingId(null);
    }
  };

  const rows = useMemo(
    () => buildRows({ contacts, matches, contactIdsByHash: idsByHash, query }),
    [contacts, matches, idsByHash, query]
  );
  const view = findMatesView(access, phase);

  const avatar = (account: MatchedAccount | null, label: string) =>
    account?.avatar_url ? (
      <Image source={{ uri: account.avatar_url, cache: 'force-cache' }} style={styles.avatar} />
    ) : (
      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
        {account ? (
          <Text style={[styles.avatarInitial, { color: text }]}>
            {label[0]?.toUpperCase() ?? '?'}
          </Text>
        ) : (
          <ProfileIcon size={ICON_SIZE.i20} color={muted} />
        )}
      </View>
    );

  const renderRow = ({ item }: { item: FindMatesRow }) => {
    if (item.kind === 'header') {
      return (
        <View>
          <Text style={[styles.sectionTitle, { color: muted }]} accessibilityRole="header">
            {item.title}
          </Text>
          {/* The sender hears about the mutual follow before inviting (CLAUDE.md invariant). */}
          {item.key === 'h-invite' ? (
            <Text style={[styles.noneLine, { color: muted }]}>
              When they join from your link, you’ll follow each other.
            </Text>
          ) : null}
        </View>
      );
    }
    if (item.kind === 'none') {
      return (
        <Text style={[styles.noneLine, { color: muted }]}>
          None of your contacts are on Mahi yet. Invite them below.
        </Text>
      );
    }
    if (item.kind === 'account') {
      const { account, contactName } = item;
      const name = account.display_name || account.username;
      const following = followingByMe[account.id] ?? account.is_following;
      const followsYou = followsMe[account.id] ?? account.follows_you;
      const requested = requestedByMe[account.id] ?? account.requested === true;
      const label = followLabel(following, followsYou, requested);
      const engaged = following || requested;
      return (
        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
            onPress={() => setProfileUserId(account.id)}
            accessibilityRole="button"
            accessibilityLabel={`${name}, @${account.username}`}
            accessibilityHint="Opens their profile"
          >
            {avatar(account, name)}
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: text }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.detail, { color: muted }]} numberOfLines={1}>
                @{account.username}
                {contactName ? ` · ${contactName} in your contacts` : ''}
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.pill,
              engaged
                ? { borderColor: border }
                : { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
              pressed && styles.pressed,
            ]}
            onPress={() => void follow(account)}
            hitSlop={OFFSET.o8}
            accessibilityRole="button"
            accessibilityLabel={`${label}, @${account.username}`}
            accessibilityHint={
              following
                ? 'Stops following them'
                : requested
                  ? 'Takes back your follow request'
                  : 'Follows them'
            }
          >
            <Text style={[styles.pillText, { color: engaged ? text : COLORS.offBlack }]}>
              {label}
            </Text>
          </Pressable>
        </View>
      );
    }
    const { contact } = item;
    const done = invited.has(contact.id);
    const busy = invitingId === contact.id;
    return (
      <View style={styles.row}>
        <View style={styles.rowMain}>
          {avatar(null, contact.name)}
          <View style={styles.rowText}>
            <Text style={[styles.name, { color: text }]} numberOfLines={1}>
              {contact.name}
            </Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.pill,
            { borderColor: done ? border : accentText },
            pressed && styles.pressed,
          ]}
          onPress={() => void invite(contact)}
          disabled={!!invitingId}
          hitSlop={OFFSET.o8}
          accessibilityRole="button"
          accessibilityLabel={done ? `Text opened for ${contact.name}` : `Invite ${contact.name}`}
          accessibilityHint={
            done ? 'Opens the same text again' : 'Opens a text to them with your invite link'
          }
          accessibilityState={{ busy }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={muted} />
          ) : (
            <Text style={[styles.pillText, { color: done ? muted : accentText }]}>
              {done ? 'Text opened' : 'Invite'}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  // The step after sign-up ends with "Not now" (or "Done" once there's a list); the sheet has back.
  const closeLabel = view === 'results' ? 'Done' : 'Not now';
  const header = (
    <View
      style={[styles.header, { borderBottomColor: border, paddingTop: insets.top + SPACE.s16 }]}
    >
      {welcome ? (
        <View style={styles.spacer} />
      ) : (
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
      )}
      <Text
        style={[styles.headerTitle, { color: text }]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        From your contacts
      </Text>
      {welcome ? (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          style={({ pressed }) => [styles.closeText, pressed && styles.pressed]}
          hitSlop={OFFSET.o8}
        >
          <Text style={[styles.closeLabel, { color: accentText }]}>{closeLabel}</Text>
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );

  const explainer = (
    title: string,
    line: string,
    note: string | null,
    primary: { label: string; hint: string; busy: boolean; onPress: () => void },
    secondary: { label: string; onPress: () => void } | null
  ) => (
    <ScrollView
      contentContainerStyle={[styles.explainer, { paddingBottom: insets.bottom + SPACE.s24 }]}
      bounces={false}
    >
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <View style={styles.people}>
          <ProfileIcon size={ICON_SIZE.i32} color={accentText} />
          <ProfileIcon size={ICON_SIZE.i32} color={accentText} />
          <ProfileIcon size={ICON_SIZE.i32} color={accentText} />
        </View>
        <Text style={[styles.cardTitle, { color: text }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[styles.cardBody, { color: muted }]}>{line}</Text>
        {note ? <Text style={[styles.cardNote, { color: muted }]}>{note}</Text> : null}
        <Pressable
          style={({ pressed }) => [styles.mainButton, pressed && styles.pressed]}
          onPress={primary.onPress}
          disabled={primary.busy}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          accessibilityHint={primary.hint}
          accessibilityState={{ busy: primary.busy }}
        >
          {primary.busy ? (
            <ActivityIndicator color={COLORS.offBlack} />
          ) : (
            <Text style={styles.mainButtonText}>{primary.label}</Text>
          )}
        </Pressable>
        {secondary ? (
          <Pressable
            style={({ pressed }) => [styles.quietButton, pressed && styles.pressed]}
            onPress={secondary.onPress}
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
          >
            <Text style={[styles.quietText, { color: accentText }]}>{secondary.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );

  let body: React.ReactNode;
  if (view === 'checking' || view === 'loading') {
    body = <ListState kind="loading" dark={dark} />;
  } else if (view === 'ask') {
    body = explainer(
      'Find friends in your contacts',
      'See who in your contacts is already on Mahi, and invite the rest by text.',
      'Your contacts stay private. Only scrambled codes of their numbers and emails leave your phone, and Mahi saves nothing.',
      {
        label: 'Find friends in your contacts',
        hint: 'Your phone will ask whether Mahi can see your contacts',
        busy: asking,
        onPress: () => void ask(),
      },
      null
    );
  } else if (view === 'denied') {
    body = explainer(
      'No problem',
      'Mahi won’t look at your contacts. You can still send a friend a link.',
      null,
      {
        label: 'Invite by link instead',
        hint: 'Makes a link to share. When they join, you’ll follow each other.',
        busy: linking,
        onPress: () => void inviteByLink(),
      },
      { label: 'Turn on in settings', onPress: () => void Linking.openSettings() }
    );
  } else if (view === 'error') {
    const refusal = isMatchRefusal(failure);
    body = (
      <ListState
        kind="error"
        dark={dark}
        title="Couldn’t check your contacts"
        line={refusal ? matchErrorText(failure) : undefined}
        onAction={refusal ? undefined : () => void load()}
      />
    );
  } else {
    body = (
      <>
        <View style={[styles.searchWrap, { borderBottomColor: border }]}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: inputBg, color: text }]}
            placeholder="Search contacts"
            placeholderTextColor={muted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search contacts"
          />
        </View>
        {rows.length === 0 ? (
          <ListState
            kind="empty"
            dark={dark}
            title={query ? 'Nobody by that name' : 'No contacts to show'}
            line={query ? 'Try another name or number.' : 'Send a friend a link instead.'}
            actionLabel={query || linking ? undefined : INVITE_BUTTON}
            onAction={query ? undefined : () => void inviteByLink()}
          />
        ) : (
          <FlashList
            data={rows}
            keyExtractor={(row) => row.key}
            getItemType={(row) => row.kind}
            extraData={{ followingByMe, followsMe, requestedByMe, invited, invitingId }}
            renderItem={renderRow}
            contentContainerStyle={{ ...styles.listContent, paddingBottom: insets.bottom }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
          />
        )}
      </>
    );
  }

  return (
    <>
      <View style={[styles.root, { backgroundColor: bg }]}>
        {header}
        {body}
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
    width: SIZE.z64,
    height: SIZE.z36,
  },
  closeText: {
    width: SIZE.z64,
    minHeight: SIZE.z36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
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
  explainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s24,
  },
  card: {
    alignItems: 'center',
    borderRadius: RADIUS.r24,
    padding: SPACE.s24,
  },
  people: {
    flexDirection: 'row',
    gap: SPACE.s4,
  },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f20,
    lineHeight: LINE_HEIGHT.l28,
    textAlign: 'center',
    marginTop: SPACE.s12,
  },
  cardBody: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l22,
    textAlign: 'center',
    marginTop: SPACE.s8,
  },
  cardNote: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
    lineHeight: LINE_HEIGHT.l18,
    textAlign: 'center',
    marginTop: SPACE.s12,
  },
  // The app's one main-button style (ListState's): accent pill, dark words.
  mainButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: SIZE.z44,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACE.s24,
    marginTop: SPACE.s24,
  },
  mainButtonText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  quietButton: {
    minHeight: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s12,
    marginTop: SPACE.s8,
  },
  quietText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
  },
  searchWrap: {
    paddingHorizontal: SPACE.s20,
    paddingVertical: SPACE.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    height: SIZE.z40,
    borderRadius: RADIUS.r20,
    paddingHorizontal: SPACE.s16,
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f14,
  },
  listContent: {
    paddingHorizontal: SPACE.s20,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f13,
    paddingTop: SPACE.s20,
    paddingBottom: SPACE.s4,
  },
  noneLine: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
    lineHeight: LINE_HEIGHT.l18,
    paddingVertical: SPACE.s12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
    paddingVertical: SPACE.s10,
  },
  rowMain: {
    flex: 1,
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
  detail: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
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
});
