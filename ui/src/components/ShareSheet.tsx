import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Image,
  Keyboard,
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
import { randomUUID } from 'expo-crypto';
import { getFriends, sharePostToFriends, type FeedPost, type FollowListUser } from '@/api';
import type { MateInvite } from '@/api/tagSlots';
import { useAuthStore, useBlockStore, useFollowStore, useMessagesStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { track } from '@/lib/analytics';
import { canCopyLink } from '@/lib/copyLink';
import { FREE_TEXT_PREDICTION } from '@/lib/emojiKeyboard';
import { haptic } from '@/lib/haptics';
import { discardUnsentLink, inviteAMate, makeMateLink, sendMateLinkVia } from '@/lib/inviteAMate';
import { reportError } from '@/lib/sentry';
import { sharePost, sharePostTo } from '@/lib/sharePost';
import {
  MAX_SHARE_NOTE,
  MAX_SHARE_RECIPIENTS,
  SHARE_FRIENDS_MAX,
  SHARE_FRIENDS_PAGE,
  filterFriends,
  friendLabel,
  isShareRefusal,
  keepFriends,
  shareErrorText,
  sendLabel,
  shareResultToast,
  shareSheetParts,
  shareTargets,
  toggleRecipient,
  type ShareSheetTarget,
} from '@/lib/shareSheet';
import GlobalSearchOverlay from '@/components/GlobalSearchOverlay';
import InviteChannelIcon from '@/components/InviteChannelIcon';
import KeyboardInset from '@/components/KeyboardInset';
import ShortSheet, { type CloseShortSheet } from '@/components/ShortSheet';
import ListState from '@/components/ListState';
import { FIELD_TEXT, GLYPH, TYPOGRAPHY } from '@/constants/typography';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  ICON_SIZE,
  OFFSET,
  RADIUS,
  SHARE_SHEET,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/** What is being shared: a post (search, friends, the row) or an invite link (the row only). */
export type ShareSheetContent =
  { kind: 'post'; post: FeedPost } | { kind: 'invite'; link: MateInvite };

interface ShareSheetProps {
  content: ShareSheetContent;
  dark: boolean;
  /** `sent`: it went somewhere (a friend's chat, a copied link, another app). */
  onClose: (sent: boolean) => void;
}

/**
 * Mahi's share sheet (owner, 2026-10-10: "This is what a share sheet should look like for Mahi,
 * it's how Instagram's look"). Mount it only while it is open: every open starts fresh.
 *
 * A post: a native page sheet (swipe down or × closes) with search, a grid of your friends to
 * send it to in your Mahi chat with an optional note, and the round buttons along the bottom.
 * An invite link: a short sheet with a title and the round buttons.
 */
export default function ShareSheet({ content, dark, onClose }: ShareSheetProps): React.JSX.Element {
  const { bg } = themeColors(dark);
  if (content.kind === 'invite') {
    return <InviteShare link={content.link} dark={dark} onClose={onClose} />;
  }
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => onClose(false)}
    >
      {/* Its own native window: gesture-handler needs its own root (a profile opened from
          "Find friends" swipes closed with a pan). */}
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider style={{ backgroundColor: bg }}>
          <PostShare post={content.post} dark={dark} onClose={onClose} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * A post menu's Share. Switch `share-sheet` on (everyone): Mahi's share sheet; put `sheet` in the
 * component's own tree, so it opens over whatever sheet or viewer the post is in. Off: straight to
 * the phone's share sheet, as before.
 */
export function usePostShare(): {
  share: (post: FeedPost) => void;
  sheet: React.JSX.Element | null;
} {
  const sheetOn = useFeatureFlag('share-sheet');
  const { dark } = useAppTheme();
  // The post itself, not its id: a list row reused for another post keeps the sheet on this one.
  const [post, setPost] = useState<FeedPost | null>(null);
  const share = useCallback(
    (shared: FeedPost) => {
      if (sheetOn) setPost(shared);
      else void sharePost(shared);
    },
    [sheetOn]
  );
  const sheet = post ? (
    <ShareSheet content={{ kind: 'post', post }} dark={dark} onClose={() => setPost(null)} />
  ) : null;
  return { share, sheet };
}

/**
 * "Invite a friend", for every place that offers it. Switch `share-sheet` on (everyone): a link is
 * made on tap, then Mahi's share sheet opens with it (put `sheet` in the component's own tree);
 * `invite` settles once the sheet is up, so a "making your link" state ends there. Off: the
 * phone's share sheet, as before (`inviteAMate`). `onSent` runs when the link went somewhere; a
 * link that went nowhere is taken back on the server.
 */
export function useInviteAMate(onSent?: () => void): {
  invite: () => Promise<void>;
  sheet: React.JSX.Element | null;
} {
  const sheetOn = useFeatureFlag('share-sheet');
  const { dark } = useAppTheme();
  const [link, setLink] = useState<MateInvite | null>(null);
  const sent = useRef(onSent);
  useEffect(() => {
    sent.current = onSent;
  }, [onSent]);
  const invite = useCallback(async (): Promise<void> => {
    if (!sheetOn) {
      if (await inviteAMate()) sent.current?.();
      return;
    }
    haptic('selection');
    const made = await makeMateLink();
    if (made) setLink(made);
  }, [sheetOn]);
  const close = (went: boolean) => {
    if (link && !went) discardUnsentLink(link.token);
    setLink(null);
    if (went) sent.current?.();
  };
  const sheet = link ? (
    <ShareSheet content={{ kind: 'invite', link }} dark={dark} onClose={close} />
  ) : null;
  return { invite, sheet };
}

/**
 * Your friends (you follow each other), fresh from the server, a page at a time so search covers
 * all of them; people you've blocked are left out. Null when a read failed (reported).
 */
async function readFriends(userId: string): Promise<FollowListUser[] | null> {
  const all: FollowListUser[] = [];
  for (let offset = 0; offset < SHARE_FRIENDS_MAX; offset += SHARE_FRIENDS_PAGE) {
    const { data, error } = await getFriends(userId, SHARE_FRIENDS_PAGE, offset);
    if (error || !data) {
      reportError(error ?? new Error('get_friends returned no data'), {
        flow: 'follows',
        action: 'loadShareFriends',
        level: 'warning',
        extra: { rpc: 'get_friends', offset },
      });
      return null;
    }
    all.push(...data);
    if (data.length < SHARE_FRIENDS_PAGE) break;
  }
  return all.filter((f) => !useBlockStore.getState().isBlocked(f.id));
}

/** Whether the keyboard is up: the home-indicator gap and the button row only show without it. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setOpen(true)
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setOpen(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

function PostShare({
  post,
  dark,
  onClose,
}: {
  post: FeedPost;
  dark: boolean;
  onClose: (sent: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const show = useToastStore((s) => s.show);
  const { bg, text, muted, border } = themeColors(dark);
  const inputBg = dark ? COLORS.surfaceDark : COLORS.surfaceLight2;
  const avatarBg = dark ? COLORS.surfaceDark : COLORS.offWhite;
  const parts = shareSheetParts('post');

  // Friends are never kept on the phone (RULES.md, follow lists): a loading state, then the
  // server's list, each time the sheet opens; re-read live while it is open.
  const [friends, setFriends] = useState<FollowListUser[]>([]);
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  // What went wrong, said inside the sheet: on build 10 and Android a toast is drawn under it.
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<ShareSheetTarget | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  // One id for this open: a retry after a dropped connection sends nothing twice.
  const [clientId] = useState(() => randomUUID());
  const keyboardOpen = useKeyboardOpen();
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    []
  );

  const load = useCallback(() => {
    if (!userId) return;
    void readFriends(userId).then((all) => {
      if (!live.current) return;
      if (!all) {
        // A list already on screen was read this open, so it stays; with none, say it failed.
        setPhase((p) => (p === 'ready' ? p : 'error'));
        return;
      }
      setFriends(all);
      // Someone who stopped being a friend meanwhile leaves the picks.
      setSelected((picked) => keepFriends(picked, all));
      setPhase('ready');
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    // Live while open: a follow or unfollow either way changes who your friends are. Back from
    // the background, read again too: the connection may have slept through one.
    const unsubscribe = useFollowStore.getState().subscribeToFollows(userId, userId, load);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => {
      unsubscribe();
      foreground.remove();
    };
  }, [userId, load]);

  const retry = () => {
    setPhase('loading');
    load();
  };

  const shown = useMemo(() => filterFriends(friends, query), [friends, query]);
  const targets = useMemo(() => shareTargets(canCopyLink()), []);

  // While the sheet is open a message is a line in it (and read out); once it has closed, a toast.
  const say = (message: string) => {
    if (!live.current) return show(message);
    setNotice(message);
    AccessibilityInfo.announceForAccessibility(message);
  };

  const pick = (id: string) => {
    const next = toggleRecipient(selected, id);
    if (next.full) {
      haptic('warning');
      say(`You can send to ${MAX_SHARE_RECIPIENTS} friends at a time.`);
      return;
    }
    haptic('selection');
    setNotice(null);
    setSelected(next.selected);
  };

  const send = async () => {
    if (sending || selected.length === 0) return;
    setNotice(null);
    setSending(true);
    const { data, error } = await sharePostToFriends(post.id, selected, clientId, note);
    // Swiped shut while it was going: the toast still says how it went; nothing here is touched.
    const open = live.current;
    if (open) setSending(false);
    const sent = data?.sent.length ?? 0;
    const skipped = data?.skipped.length ?? 0;
    if (error || !data || sent + skipped === 0) {
      const message = error?.message ?? '';
      if (!isShareRefusal(message)) {
        reportError(error ?? new Error('share_post sent to nobody'), {
          flow: 'messages',
          action: 'sharePost',
          extra: { postId: post.id, count: selected.length, rpc: 'share_post' },
        });
      }
      // The picks and the note stay, so it can be sent again.
      haptic('error');
      say(shareErrorText(message));
      return;
    }
    if (sent === 0) {
      // Nobody could take it (blocked, a closed chat, a request waiting): pick someone else.
      haptic('warning');
      say(shareResultToast(sent, skipped));
      if (open) setSelected((picked) => picked.filter((id) => !data.skipped.includes(id)));
      return;
    }
    haptic('tick');
    show(shareResultToast(sent, skipped));
    track('post_shared', { post_id: post.id, friends: sent, via: 'mahi' });
    // The inbox line ("Sent a post") comes from the server.
    void useMessagesStore.getState().sync();
    if (!open) return;
    Keyboard.dismiss();
    onClose(true);
  };

  const runTarget = async (target: ShareSheetTarget) => {
    if (busy) return;
    haptic('selection');
    setBusy(target);
    const went = await sharePostTo(post, target);
    if (!live.current) return;
    setBusy(null);
    if (went) onClose(true);
  };

  const renderFriend = ({ item }: { item: FollowListUser }) => {
    const name = friendLabel(item);
    const picked = selected.includes(item.id);
    return (
      <Pressable
        style={({ pressed }) => [styles.friend, pressed && styles.pressed]}
        onPress={() => pick(item.id)}
        accessibilityRole="checkbox"
        accessibilityLabel={`${name}, @${item.username}`}
        accessibilityState={{ checked: picked }}
        accessibilityHint={picked ? 'Takes them off this send' : 'Adds them to this send'}
      >
        <View style={styles.avatarWrap}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url, cache: 'force-cache' }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
              <Text style={[styles.avatarInitial, { color: text }]}>
                {name[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
          {picked ? (
            <>
              <View style={[styles.avatarRing, { borderColor: COLORS.accent }]} />
              <View style={[styles.tick, { borderColor: bg }]}>
                <Text style={styles.tickText}>✓</Text>
              </View>
            </>
          ) : null}
        </View>
        <Text style={[styles.friendName, { color: text }]} numberOfLines={1}>
          {name}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <View style={[styles.root, { backgroundColor: bg }]}>
        {/* A page sheet starts below the status bar; Android's full-screen one doesn't. */}
        <SheetHeader
          title={parts.title}
          dark={dark}
          topInset={insets.top}
          onClose={() => onClose(false)}
        />
        <View style={styles.searchWrap}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: inputBg, color: text }]}
            placeholder="Search"
            placeholderTextColor={muted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            keyboardAppearance={dark ? 'dark' : 'light'}
            accessibilityLabel="Search your friends"
          />
        </View>

        {phase === 'loading' ? (
          <ListState kind="loading" dark={dark} />
        ) : phase === 'error' ? (
          <ListState kind="error" dark={dark} title="Couldn’t load your friends" onAction={retry} />
        ) : friends.length === 0 ? (
          <ListState
            kind="empty"
            dark={dark}
            title="No friends yet"
            line="Follow each other and you can send posts to each other."
            actionLabel="Find friends"
            onAction={() => {
              Keyboard.dismiss();
              setFindOpen(true);
            }}
          />
        ) : shown.length === 0 ? (
          <ListState
            kind="empty"
            dark={dark}
            title="Nobody by that name"
            line="Try another name or username."
          />
        ) : (
          // The bar below is anchored to the bottom and ends with KeyboardInset, so this list
          // shrinks to sit above the keyboard: no inset of its own (that would count it twice).
          <FlashList
            data={shown}
            keyExtractor={(item) => item.id}
            numColumns={SHARE_SHEET.columns}
            extraData={selected}
            renderItem={renderFriend}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          />
        )}

        <View style={[styles.bottom, { borderTopColor: border, backgroundColor: bg }]}>
          {notice ? <Text style={[styles.notice, { color: text }]}>{notice}</Text> : null}
          {selected.length > 0 ? (
            <View style={styles.sendBar}>
              <TextInput
                style={[styles.note, { color: text, borderColor: border }]}
                placeholder="Write a note…"
                placeholderTextColor={muted}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={MAX_SHARE_NOTE}
                keyboardAppearance={dark ? 'dark' : 'light'}
                accessibilityLabel="Note, optional"
                {...FREE_TEXT_PREDICTION}
              />
              <Pressable
                style={({ pressed }) => [styles.send, (pressed || sending) && styles.pressed]}
                onPress={() => void send()}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel={`Send to ${selected.length} ${selected.length === 1 ? 'friend' : 'friends'}`}
                accessibilityState={{ busy: sending, disabled: sending }}
              >
                {sending ? (
                  <ActivityIndicator color={COLORS.offBlack} />
                ) : (
                  <Text style={styles.sendText}>{sendLabel(selected.length)}</Text>
                )}
              </Pressable>
            </View>
          ) : null}
          {/* With the keyboard up the row steps aside, so the friends and the note keep their room. */}
          {keyboardOpen ? null : (
            <TargetRow targets={targets} busy={busy} dark={dark} onPress={runTarget} />
          )}
          <View style={{ height: keyboardOpen ? SPACE.s8 : insets.bottom }} />
          <KeyboardInset />
        </View>
      </View>

      {/* "Find friends" on an empty list: people search, over the sheet. A follow made there
          reaches the list live. */}
      <GlobalSearchOverlay visible={findOpen} onClose={() => setFindOpen(false)} dark={dark} />
    </>
  );
}

function InviteShare({
  link,
  dark,
  onClose,
}: {
  link: MateInvite;
  dark: boolean;
  onClose: (sent: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const { bg } = themeColors(dark);
  const parts = shareSheetParts('invite');
  const targets = useMemo(() => shareTargets(canCopyLink()), []);
  const [busy, setBusy] = useState<ShareSheetTarget | null>(null);
  const live = useRef(true);
  useEffect(() => {
    // A keyboard left up by the screen underneath (people search) would cover the sheet.
    Keyboard.dismiss();
    return () => {
      live.current = false;
    };
  }, []);

  const runTarget = async (target: ShareSheetTarget, close: CloseShortSheet) => {
    if (busy) return;
    haptic('selection');
    setBusy(target);
    const went = await sendMateLinkVia(link, target);
    if (!live.current) return;
    setBusy(null);
    if (went) close(() => onClose(true));
  };

  return (
    <ShortSheet dark={dark} native onDismiss={() => onClose(false)}>
      {(close) => (
        <View style={[styles.card, { backgroundColor: bg }]} accessibilityViewIsModal>
          <SheetHeader title={parts.title} dark={dark} onClose={() => close()} />
          <TargetRow
            targets={targets}
            busy={busy}
            dark={dark}
            onPress={(target) => runTarget(target, close)}
          />
          <View style={{ height: insets.bottom }} />
          <KeyboardInset />
        </View>
      )}
    </ShortSheet>
  );
}

function SheetHeader({
  title,
  dark,
  topInset = 0,
  onClose,
}: {
  title: string;
  dark: boolean;
  /** Room for the status bar when the sheet reaches the top of the screen. */
  topInset?: number;
  onClose: () => void;
}) {
  const { text, muted } = themeColors(dark);
  return (
    <View style={[styles.header, { paddingTop: topInset + SPACE.s16 }]}>
      <View style={styles.headerSide} />
      <Text style={[styles.title, { color: text }]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.headerSide, pressed && styles.pressed]}
        onPress={onClose}
        hitSlop={OFFSET.o8}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={[styles.closeText, { color: muted }]}>×</Text>
      </Pressable>
    </View>
  );
}

/** The round buttons along the bottom, each with its mark and its name under it; scrolls sideways. */
function TargetRow({
  targets,
  busy,
  dark,
  onPress,
}: {
  targets: { target: ShareSheetTarget; label: string }[];
  busy: ShareSheetTarget | null;
  dark: boolean;
  onPress: (target: ShareSheetTarget) => void | Promise<void>;
}) {
  const { text } = themeColors(dark);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.targets}
    >
      {targets.map(({ target, label }) => (
        <Pressable
          key={target}
          style={({ pressed }) => [styles.target, (pressed || busy !== null) && styles.pressed]}
          onPress={() => void onPress(target)}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ busy: busy === target, disabled: busy !== null }}
        >
          <View style={[styles.targetCircle, { backgroundColor: withAlpha(text, ALPHA.a10) }]}>
            {busy === target ? (
              <ActivityIndicator color={text} />
            ) : (
              <InviteChannelIcon
                channel={target === 'more' ? 'share' : target}
                size={ICON_SIZE.i24}
                color={text}
              />
            )}
          </View>
          <Text style={[styles.targetLabel, { color: text }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s16,
    paddingBottom: SPACE.s8,
  },
  headerSide: {
    width: SIZE.z36,
    height: SIZE.z36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...TYPOGRAPHY.sheetTitle,
    flex: 1,
    textAlign: 'center',
  },
  closeText: {
    ...GLYPH.icon,
  },
  searchWrap: {
    paddingHorizontal: SPACE.s20,
    paddingBottom: SPACE.s12,
  },
  searchInput: {
    ...FIELD_TEXT,
    height: SIZE.z40,
    borderRadius: RADIUS.r20,
    paddingHorizontal: SPACE.s16,
  },
  grid: {
    paddingHorizontal: SPACE.s12,
    paddingBottom: SPACE.s16,
  },
  // One cell of the grid: the list gives it a third of the width.
  friend: {
    alignItems: 'center',
    gap: SPACE.s6,
    paddingVertical: SPACE.s10,
    paddingHorizontal: SPACE.s4,
  },
  avatarWrap: {
    width: SHARE_SHEET.avatar,
    height: SHARE_SHEET.avatar,
  },
  avatar: {
    width: SHARE_SHEET.avatar,
    height: SHARE_SHEET.avatar,
    borderRadius: RADIUS.pill,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...TYPOGRAPHY.h1,
  },
  // A picked friend: an accent ring round the photo and a tick at its corner (as MateCircles).
  avatarRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER_WIDTH.w2,
  },
  tick: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: SHARE_SHEET.tick,
    height: SHARE_SHEET.tick,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER_WIDTH.w2,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickText: {
    ...TYPOGRAPHY.captionStrong,
    color: COLORS.offBlack,
  },
  friendName: {
    ...TYPOGRAPHY.bodyStrong,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  bottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  notice: {
    ...TYPOGRAPHY.small,
    textAlign: 'center',
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s10,
  },
  sendBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.s10,
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s10,
  },
  note: {
    ...TYPOGRAPHY.input,
    flex: 1,
    minHeight: SIZE.z44,
    maxHeight: SHARE_SHEET.noteMaxHeight,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.r22,
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s12,
    paddingBottom: SPACE.s12,
  },
  // The app's one main-button style (ListState's): accent pill, dark words.
  send: {
    minHeight: SIZE.z44,
    minWidth: SIZE.z80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACE.s20,
  },
  sendText: {
    ...TYPOGRAPHY.pillLabel,
    color: COLORS.offBlack,
  },
  targets: {
    paddingHorizontal: SPACE.s12,
    paddingTop: SPACE.s12,
    paddingBottom: SPACE.s4,
    gap: SPACE.s4,
  },
  target: {
    width: SHARE_SHEET.targetWidth,
    alignItems: 'center',
    gap: SPACE.s6,
  },
  targetCircle: {
    width: SHARE_SHEET.target,
    height: SHARE_SHEET.target,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetLabel: {
    ...TYPOGRAPHY.caption,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  // The invite sheet: a short card over the dimmed screen.
  card: {
    borderTopLeftRadius: RADIUS.r24,
    borderTopRightRadius: RADIUS.r24,
  },
});
