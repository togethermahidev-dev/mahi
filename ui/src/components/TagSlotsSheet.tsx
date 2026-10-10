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
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import { noteInviteSent } from '@/lib/inviteAMate';
import { useAuthStore } from '@/store';
import KeyboardInset from '@/components/KeyboardInset';
import InviteChannelIcon from '@/components/InviteChannelIcon';
import { loadContacts, readDeviceContacts } from '@/lib/contactsModule';
import { matchContacts } from '@/api/contacts';
import {
  buildMatchPlan,
  buildRows,
  contactsAccess,
  smsInviteUrl,
  whatsappInviteUrl,
  type InviteContact,
  type MatchedAccount,
} from '@/lib/contactMatch';
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
  SHARE_TARGETS,
  contactPersonAction,
  inviteBlockedReason,
  isSlotRefusal,
  mergeSlots,
  personAction,
  postButtonLabel,
  shareAppUrl,
  shareTargetVia,
  slotErrorText,
  slotLabel,
  slotShareMessage,
  slotStateText,
  tagScreenWords,
  type ScreenSlot,
  type ShareTarget,
} from '@/lib/tagSlots';
import { FIELD_TEXT, GLYPH, TYPOGRAPHY } from '@/constants/typography';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  ICON_SIZE,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  WAIT,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/lib/themeColors';
import { useAppTheme } from '@/hooks/useAppTheme';

/** Someone to tag or ask: a friend, anyone found on Mahi, or a contact who is on Mahi. */
type Person = Pick<TagPerson, 'id' | 'username' | 'display_name' | 'avatar_url'>;

type ContactChoice =
  | { kind: 'mahi'; id: string; name: string; account: MatchedAccount }
  | { kind: 'invite'; id: string; name: string; contact: InviteContact };

/** A row of the contacts list: anyone on Mahi matching the search, then your contacts. */
type ContactListRow = ContactChoice | { kind: 'person'; id: string; person: TagPerson };

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

const asTagged = (p: Person): TaggedUser => ({
  user_id: p.id,
  username: p.username,
  display_name: p.display_name,
  avatar_url: p.avatar_url,
});

/**
 * The tag screen (core workflow, 2026-10-09). A first post tags 1 mate, an answer tags the tag
 * count (`maxTags`). Each slot is filled by a friend you tag, an in-app tag request for someone
 * on Mahi who isn't your friend, or a link shared the moment you tap. Slots say where they're at,
 * fresh from the server when the screen opens and live while it stays open. With no friend to
 * tag, your contacts come next: hashes find who is on Mahi, and anyone else gets a link sent
 * from your phone. Contact details stay on the phone, in memory only.
 *
 * Its Post button is the confirmation (no separate pop-up). Closing (✕ or a swipe down) keeps
 * everything: links and requests already exist.
 */
export default function TagSlotsSheet({
  visible,
  maxTags,
  requiredTags,
  initialFriends,
  onClose,
  onPost,
}: {
  visible: boolean;
  maxTags: number;
  /** Tags this post needs before it can go (the server enforces the same). */
  requiredTags: number;
  initialFriends: TaggedUser[];
  onClose: (friends: TaggedUser[], slots: ScreenSlot[]) => void;
  /** The Post button: posts with these tags. */
  onPost: (friends: TaggedUser[], slots: ScreenSlot[]) => void;
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
  const [contactState, setContactState] = useState<
    'idle' | 'ask' | 'loading' | 'ready' | 'denied' | 'error'
  >('idle');
  const [contactChoices, setContactChoices] = useState<ContactChoice[]>([]);
  // The contact (not on Mahi) whose send buttons are open under their name.
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const pendingCount = useRef(0);

  const single = maxTags === 1;
  const words = tagScreenWords(maxTags);
  const filled = friends.length + slots.length;
  const blocked = inviteBlockedReason({ filled, maxTags });
  const missing = Math.max(0, requiredTags - filled);
  const making = slots.some((s) => s.pending);

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
    setContactState('idle');
    setContactChoices([]);
    setSendingTo(null);
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

  const loadContactFallback = useCallback(async () => {
    setContactState('loading');
    try {
      const rows = await readDeviceContacts();
      if (!rows) {
        setContactState('denied');
        return;
      }
      const plan = await buildMatchPlan(rows, (value) =>
        digestStringAsync(CryptoDigestAlgorithm.SHA256, value)
      );
      const byId = new Map<string, MatchedAccount>();
      for (const batch of plan.batches) {
        const { data, error } = await matchContacts(batch);
        if (error || !data) throw error ?? new Error('match_contacts returned no data');
        for (const account of data) {
          const seen = byId.get(account.id);
          byId.set(
            account.id,
            seen
              ? {
                  ...account,
                  matched_hashes: [...seen.matched_hashes, ...account.matched_hashes],
                }
              : account
          );
        }
      }
      const matches = [...byId.values()];
      const choices: ContactChoice[] = buildRows({
        contacts: rows,
        matches,
        contactIdsByHash: plan.contactIdsByHash,
        query: '',
      }).flatMap((row): ContactChoice[] => {
        if (row.kind === 'account') {
          const name = row.account.display_name || row.contactName || row.account.username;
          return [
            { kind: 'mahi' as const, id: `mahi:${row.account.id}`, name, account: row.account },
          ];
        }
        if (row.kind === 'contact') {
          return [
            {
              kind: 'invite' as const,
              id: `contact:${row.contact.id}`,
              name: row.contact.name,
              contact: row.contact,
            },
          ];
        }
        return [];
      });
      track('contacts_matched', { count_on_mahi: matches.length, count_total: rows.length });
      setContactChoices(choices);
      setContactState('ready');
    } catch (error) {
      reportError(error, { flow: 'tags', action: 'loadContactFallback' });
      setContactState('error');
    }
  }, []);

  // Contacts are the fallback only: if at least one Mahi friend can take this tag, the phone's
  // contacts are neither requested nor read.
  useEffect(() => {
    if (!visible || !loaded || friendList === null) return;
    const eligible = friendList.some((person) => person.is_friend && !person.has_open_tag);
    if (eligible) {
      setContactState('idle');
      setContactChoices([]);
      return;
    }
    const sdk = loadContacts();
    if (!sdk) {
      setContactState('denied');
      return;
    }
    let stale = false;
    void sdk
      .getPermissionsAsync()
      .then((permission) => {
        if (stale) return;
        const access = contactsAccess(permission);
        if (access === 'granted') void loadContactFallback();
        else setContactState(access);
      })
      .catch((error) => {
        reportError(error, { flow: 'tags', action: 'readContactPermission', level: 'warning' });
        if (!stale) setContactState('error');
      });
    return () => {
      stale = true;
    };
  }, [friendList, loadContactFallback, loaded, visible]);

  const askForContacts = async () => {
    const sdk = loadContacts();
    if (!sdk) return setContactState('denied');
    try {
      const answer = await sdk.requestPermissionsAsync();
      track('contacts_permission', { granted: answer.granted });
      if (answer.granted) await loadContactFallback();
      else setContactState('denied');
    } catch (error) {
      reportError(error, { flow: 'tags', action: 'requestContactPermission' });
      setContactState('error');
    }
  };

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

  const madeSlots = () => slots.filter((s) => !s.pending);
  const close = () => onClose(friends, madeSlots());

  const post = () => {
    if (making) return;
    if (missing > 0) return say(postButtonLabel(missing, filled > 0));
    onPost(friends, madeSlots());
  };

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

  const tagFriend = (p: Person) => {
    if (friends.some((f) => f.user_id === p.id)) {
      setFriends((list) => list.filter((f) => f.user_id !== p.id));
      return;
    }
    // One tag (a first post): a tap swaps the friend picked; a link or request must be taken
    // back first.
    if (single && slots.length === 0) {
      haptic('selection');
      setNotice(null);
      setFriends([asTagged(p)]);
      return;
    }
    if (filled >= maxTags) return say(blocked ?? `All ${maxTags} tags used`);
    haptic('selection');
    setNotice(null);
    setFriends((list) => [...list, asTagged(p)]);
  };

  const sendTagInvite = async (p: Person) => {
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

  const invitePerson = (p: Person) => {
    if (blocked) return say(blocked);
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

  /**
   * One share; only a send that went somewhere counts. `contact`: sent straight to a picked
   * contact (WhatsApp or Messages to their number); their name goes with the link either way, so
   * the post can show their initials.
   */
  const share = async (
    slot: ScreenSlot,
    target: ShareTarget,
    contact?: InviteContact
  ): Promise<boolean> => {
    if (!slot.url || !slot.code) return false;
    const message = slotShareMessage(slot.url, slot.code);
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    let shared = false;
    // How it really went: the share sheet when the app asked for isn't on this phone.
    let via = shareTargetVia(target, !!contact);
    try {
      if (target === 'whatsapp' || target === 'messages') {
        const url = contact
          ? target === 'whatsapp'
            ? whatsappInviteUrl(contact.phone, message)
            : smsInviteUrl(contact.phone, message, platform)
          : shareAppUrl(target, message, platform);
        await Linking.openURL(url);
        shared = true;
      } else {
        // Snap and IG have no kit in this build: the phone's sheet, with the link for a preview.
        const content = target === 'more' ? { message } : { message, url: slot.url };
        shared = (await Share.share(content)).action === Share.sharedAction;
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
        say('Couldn’t open sharing. Try again.');
        return false;
      }
    }
    if (!shared) return false;
    replaceSlot(slot.challenge_id, { state: 'shared' });
    noteInviteSent(
      slot.token,
      via,
      contact?.name ?? null,
      contact && via === 'contact' ? contact.phone : null
    );
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
    track('invite_shared', {
      via: target === 'whatsapp' || target === 'messages' ? target : 'more',
      challenge_id: slot.challenge_id,
    });
    return true;
  };

  const shareNewLink = async (target: ShareTarget, contact?: InviteContact) => {
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
    const sent = await share(emptySlot(data.challenge_id, made), target, contact);
    if (sent && contact) setSendingTo(null);
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

  // What tapping someone does: tag, untag, send a tag request, or nothing (with why).
  const pressPerson = (p: TagPerson) => {
    const inSlot = slots.some((s) => s.user_id === p.id);
    if (inSlot) return;
    const { action } = personAction(
      p,
      friends.some((f) => f.user_id === p.id)
    );
    if (action === 'tag' || action === 'untag') tagFriend(p);
    else if (action === 'invite') invitePerson(p);
  };

  const pressContact = (item: ContactChoice) => {
    if (item.kind === 'invite') {
      if (blocked) return say(blocked);
      setSendingTo((id) => (id === item.id ? null : item.id));
      return;
    }
    const a = item.account;
    const person: Person = {
      id: a.id,
      username: a.username,
      display_name: a.display_name,
      avatar_url: a.avatar_url,
    };
    if (friends.some((f) => f.user_id === a.id)) return tagFriend(person);
    const openTag = (friendList ?? []).some((f) => f.id === a.id && f.has_open_tag);
    const action = contactPersonAction(a, openTag);
    if (action === 'tag') tagFriend(person);
    else if (action === 'invite') invitePerson(person);
  };

  const eligibleFriends = (friendList ?? []).filter(
    (person) => person.is_friend && !person.has_open_tag
  );
  const contactsMode = loaded && eligibleFriends.length === 0;
  const q = query.trim();
  const listed = q ? results : (friendList ?? []);
  const contactRows: ContactListRow[] = q
    ? [
        ...results.map((person) => ({ kind: 'person' as const, id: person.id, person })),
        ...contactChoices.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())),
      ]
    : contactChoices;

  const shareButtons = (onSend: (target: ShareTarget) => void, to?: string) => (
    <View style={styles.shareRow}>
      {SHARE_TARGETS.map(({ target, label }) => (
        <Pressable
          key={target}
          accessibilityRole="button"
          accessibilityLabel={to ? `Send ${to} a link by ${label}` : `Send a link by ${label}`}
          accessibilityState={{ disabled: !!blocked }}
          style={({ pressed }) => [
            styles.shareButton,
            { backgroundColor: withAlpha(colors.text, ALPHA.a10) },
            blocked ? styles.shareButtonOff : null,
            pressed && styles.pressed,
          ]}
          onPress={() => onSend(target)}
        >
          {target === 'more' ? null : (
            <InviteChannelIcon channel={target} size={ICON_SIZE.i16} color={colors.text} />
          )}
          <Text style={[styles.shareButtonText, { color: colors.text }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const contactRow = (row: ContactListRow) => {
    if (row.kind === 'person') {
      const p = row.person;
      const tagged = friends.some((f) => f.user_id === p.id);
      const inSlot = slots.find((s) => s.user_id === p.id);
      const { action, note } = inSlot
        ? { action: 'none' as const, note: slotStateText(inSlot.state).toLowerCase() }
        : personAction(p, tagged);
      return (
        <ListRow
          name={p.display_name ?? p.username}
          handle={`@${p.username}${note ? ` · ${note}` : ''}`}
          avatarUrl={p.avatar_url}
          end={tagged ? 'Tagged ✓' : action === 'invite' ? 'Ask' : action === 'tag' ? 'Tag' : null}
          disabled={action === 'none'}
          onPress={() => pressPerson(p)}
        />
      );
    }
    if (row.kind === 'mahi') {
      const a = row.account;
      const tagged = friends.some((f) => f.user_id === a.id);
      const inSlot = slots.find((s) => s.user_id === a.id);
      const openTag = (friendList ?? []).some((f) => f.id === a.id && f.has_open_tag);
      const action = inSlot ? 'none' : contactPersonAction(a, openTag);
      return (
        <ListRow
          name={row.name}
          handle={`@${a.username} · ${inSlot ? slotStateText(inSlot.state).toLowerCase() : 'on Mahi'}`}
          avatarUrl={a.avatar_url}
          end={tagged ? 'Tagged ✓' : action === 'invite' ? 'Ask' : action === 'tag' ? 'Tag' : null}
          disabled={action === 'none' && !tagged}
          onPress={() => pressContact(row)}
        />
      );
    }
    const open = sendingTo === row.id;
    return (
      <View>
        <ListRow
          name={row.name}
          handle={open ? 'Send them a link' : null}
          end={open ? null : 'Invite'}
          onPress={() => pressContact(row)}
        />
        {open ? (
          <View style={styles.contactSend}>
            {shareButtons((target) => void shareNewLink(target, row.contact), row.name)}
          </View>
        ) : null}
      </View>
    );
  };

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
            {words.title}
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

        <Text style={[styles.prompt, { color: colors.muted }]}>{words.prompt}</Text>

        {!loaded ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <>
            {slots.length > 0 ? (
              <View style={styles.slotRow}>
                {slots.map((slot) => {
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
                      onPress={canReshare && !slot.pending ? () => share(slot, 'more') : undefined}
                      onRemove={slot.pending ? undefined : () => confirmRemove(slot)}
                    />
                  );
                })}
              </View>
            ) : null}

            <View style={styles.shareBlock}>
              <Text style={[styles.shareLabel, { color: colors.muted }]}>
                {blocked ??
                  'Want to see someone else show up? Send a link. When they join, you’ll automatically follow each other.'}
              </Text>
              {shareButtons((target) => void shareNewLink(target))}
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
              placeholder={
                contactsMode && contactState === 'ready'
                  ? 'Search contacts or anyone on Mahi'
                  : 'Search friends or anyone on Mahi'
              }
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="search"
              clearButtonMode="while-editing"
              keyboardAppearance={dark ? 'dark' : 'light'}
            />

            {!contactsMode ? (
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
                      {q ? 'No one found.' : 'No friends yet. Follow each other, or send a link.'}
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
                      onPress={() => pressPerson(item)}
                    />
                  );
                }}
              />
            ) : contactState === 'ready' || q ? (
              <FlatList
                data={contactRows}
                keyExtractor={(row) => row.id}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                style={styles.list}
                contentContainerStyle={styles.contactList}
                ListHeaderComponent={
                  q ? null : (
                    <Text style={[styles.cardEyebrow, { color: colors.muted }]}>
                      From your contacts
                    </Text>
                  )
                }
                ListEmptyComponent={
                  searching ? null : (
                    <Text style={[styles.empty, { color: colors.muted }]}>
                      {q ? 'No one found.' : 'No contacts to show.'}
                    </Text>
                  )
                }
                renderItem={({ item }) => contactRow(item)}
              />
            ) : (
              <View style={styles.contactState}>
                {contactState === 'loading' || contactState === 'idle' ? (
                  <ActivityIndicator color={colors.text} />
                ) : contactState === 'ask' ? (
                  <>
                    <Text style={[styles.contactCopy, { color: colors.muted }]}>
                      You don’t have a friend on Mahi to tag yet. Pick someone from your contacts
                      and we’ll write the invite for you.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void askForContacts()}
                      style={({ pressed }) => [
                        styles.contactButton,
                        { backgroundColor: colors.text },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.contactButtonText, { color: colors.bg }]}>
                        Choose from contacts
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={[styles.contactCopy, { color: colors.muted }]}>
                    Contacts aren’t available. Send a link above instead.
                  </Text>
                )}
              </View>
            )}
          </>
        )}

        <Text style={[styles.footer, { color: colors.muted }]}>{words.footer}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: making || missing > 0, busy: making }}
          style={({ pressed }) => [
            styles.done,
            { backgroundColor: colors.text },
            (making || missing > 0) && styles.doneOff,
            pressed && styles.pressed,
          ]}
          onPress={post}
        >
          <Text style={[styles.doneText, { color: colors.bg }]}>
            {missing > 0 ? postButtonLabel(missing, filled > 0) : 'Post'}
          </Text>
        </Pressable>
        <KeyboardInset />
      </View>
    </Modal>
  );
}

/** One person in the contacts list: their picture or initial, name, a line, and what a tap does. */
function ListRow({
  name,
  handle,
  avatarUrl,
  end,
  disabled,
  onPress,
}: {
  name: string;
  handle: string | null;
  avatarUrl?: string | null;
  end: string | null;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { dark, colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, handle, end].filter(Boolean).join(', ')}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactRow,
        disabled && styles.rowOff,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.contactAvatar,
          { backgroundColor: dark ? COLORS.surfaceDark2 : COLORS.surfaceLight },
        ]}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl, cache: 'force-cache' }} style={styles.contactAvatar} />
        ) : (
          <Text style={[styles.contactInitial, { color: colors.text }]}>
            {(name[0] ?? '?').toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.contactNameWrap}>
        <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        {handle ? (
          <Text style={[styles.contactHandle, { color: colors.muted }]} numberOfLines={1}>
            {handle}
          </Text>
        ) : null}
      </View>
      {end ? <Text style={[styles.contactTag, { color: colors.text }]}>{end}</Text> : null}
    </Pressable>
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
    ...TYPOGRAPHY.sheetTitle,
    flex: 1,
    color: COLORS.offWhite,
  },
  prompt: {
    ...TYPOGRAPHY.body,
    color: themeColors(true).muted,
  },
  headerEnd: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s8 },
  counter: {
    ...TYPOGRAPHY.caption,
    color: themeColors(true).muted,
  },
  closeX: { width: SIZE.z28, height: SIZE.z28, alignItems: 'center', justifyContent: 'center' },
  closeXText: {
    ...GLYPH.icon,
    color: themeColors(true).muted,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardEyebrow: {
    ...TYPOGRAPHY.sectionHeader,
    paddingBottom: SPACE.s4,
  },
  contactState: {
    flex: 1,
    justifyContent: 'center',
    gap: SPACE.s16,
  },
  contactCopy: {
    ...TYPOGRAPHY.small,
    textAlign: 'center',
  },
  contactButton: {
    minHeight: SIZE.z52,
    borderRadius: RADIUS.r50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s16,
  },
  contactButtonText: {
    ...TYPOGRAPHY.button,
  },
  contactList: { paddingBottom: SPACE.s8 },
  contactSend: { paddingVertical: SPACE.s8 },
  contactRow: {
    minHeight: SIZE.z64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(COLORS.offWhite, ALPHA.a12),
  },
  contactAvatar: {
    width: SIZE.z40,
    height: SIZE.z40,
    borderRadius: RADIUS.r20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: { ...TYPOGRAPHY.h4 },
  contactNameWrap: { flex: 1, gap: SPACE.s2 },
  contactName: { ...TYPOGRAPHY.bodyStrong },
  contactHandle: { ...TYPOGRAPHY.caption },
  contactTag: { ...TYPOGRAPHY.labelStrong },
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
  slotInitial: { ...TYPOGRAPHY.h2, color: COLORS.offWhite },
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
  slotRemoveText: { ...TYPOGRAPHY.badge, color: COLORS.offWhite },
  slotName: { ...TYPOGRAPHY.labelStrong, color: COLORS.offWhite },
  slotState: { ...TYPOGRAPHY.micro, color: COLORS.accent },
  shareBlock: {
    gap: SPACE.s8,
    paddingVertical: SPACE.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(COLORS.offWhite, ALPHA.a12),
  },
  shareLabel: {
    ...TYPOGRAPHY.caption,
    color: themeColors(true).muted,
  },
  shareRow: { flexDirection: 'row', gap: SPACE.s8 },
  shareButton: {
    flex: 1,
    minHeight: SIZE.z44,
    paddingVertical: SPACE.s6,
    borderRadius: RADIUS.r12,
    backgroundColor: withAlpha(COLORS.offWhite, ALPHA.a10),
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s2,
  },
  shareButtonOff: { opacity: ALPHA.a35 },
  shareButtonText: { ...TYPOGRAPHY.captionStrong, color: COLORS.offWhite },
  notice: { ...TYPOGRAPHY.caption, color: COLORS.amber },
  retry: { alignSelf: 'flex-start', minHeight: SIZE.z44, justifyContent: 'center' },
  retryText: { ...TYPOGRAPHY.captionMedium, color: COLORS.offWhite },
  search: {
    ...FIELD_TEXT,
    height: SIZE.z44,
    color: COLORS.offWhite,
    paddingHorizontal: SPACE.s14,
    borderRadius: RADIUS.r50,
    backgroundColor: withAlpha(COLORS.white, ALPHA.a08),
  },
  list: { flex: 1 },
  peopleGrid: { paddingVertical: SPACE.s8 },
  peopleRow: { justifyContent: 'flex-start' },
  empty: {
    ...TYPOGRAPHY.small,
    color: themeColors(true).muted,
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
  rowInitial: { ...TYPOGRAPHY.h1, color: COLORS.offWhite },
  rowText: { flex: 1 },
  rowName: {
    ...TYPOGRAPHY.labelStrong,
    maxWidth: SIZE.z80,
    color: COLORS.offWhite,
    textAlign: 'center',
  },
  rowHandle: {
    ...TYPOGRAPHY.micro,
    maxWidth: SIZE.z80,
    color: themeColors(true).muted,
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
  gridCheckText: { ...TYPOGRAPHY.badge, color: COLORS.offBlack },
  footer: {
    ...TYPOGRAPHY.small,
    textAlign: 'center',
  },
  doneOff: { opacity: ALPHA.a50 },
  done: {
    backgroundColor: COLORS.offWhite,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s16,
    alignItems: 'center',
    marginTop: SPACE.s4,
  },
  doneText: { ...TYPOGRAPHY.button, color: COLORS.offBlack },
});
