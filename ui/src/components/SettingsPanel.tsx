import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { deleteAccount, signOut } from '@/api/auth';
import { DELETE_ACCOUNT_CONFIRM } from '@/lib/account';
import { VERSION_LINE } from '@/lib/appBuild';
import { reportError } from '@/lib/sentry';
import BlockedUsersSheet from '@/components/BlockedUsersSheet';
import MyInvitesSheet from '@/components/MyInvitesSheet';
import FindMatesSheet from '@/components/FindMatesSheet';
import { useContactsFinder } from '@/hooks/useContactsFinder';
import CountBadge from '@/components/CountBadge';
import { getMyInvites } from '@/api/invites';
import { inviteBadgeCount, inviteSummary } from '@/lib/myInvites';
import { WelcomeCardsModal } from '@/components/WelcomeCards';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import ThemeToggle from '@/components/ThemeToggle';
import SegmentedControl from '@/components/SegmentedControl';
import FollowListModal from '@/components/FollowListModal';
import FollowRequestsSheet from '@/components/FollowRequestsSheet';
import { useFollowRequests } from '@/hooks/useFollowRequests';
import { useUserStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import {
  ACCOUNT_OPTIONS,
  TAG_OPTIONS,
  accountSwitchPatch,
  WORKOUT_OPTIONS,
  accountDescription,
  effectiveVisibility,
  privacyConfirm,
  tagDescription,
  workoutOptionDisabled,
  workoutsDescription,
  type AccountControls,
} from '@/lib/accountControls';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  RADIUS,
  SIZE,
  SPACE,
  TRACKING,
} from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  dark: boolean;
}

/** Settings, in a native page sheet (swipe down or Android back to close). */
export default function SettingsPanel({
  visible,
  onClose,
  dark,
}: SettingsPanelProps): React.JSX.Element {
  // The screen's insets, read outside the sheet: Help's cards fill the whole screen, not the sheet.
  const screenInsets = useSafeAreaInsets();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* A Modal is its own native window, with its own insets. It mounts on open, so a
          half-finished delete or an open list never carries over to the next open. */}
      <SafeAreaProvider style={{ backgroundColor: bg }}>
        <Sheet onClose={onClose} dark={dark} screenInsets={screenInsets} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Sheet({
  onClose,
  dark,
  screenInsets,
}: Omit<SettingsPanelProps, 'visible'> & {
  screenInsets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const insets = useSafeAreaInsets();
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted, border, accentText } = themeColors(dark);
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const surface = dark ? COLORS.surfaceDark : COLORS.paper;
  const iconSurface = dark ? COLORS.surfaceDark2 : COLORS.surfaceLight;
  const danger = dark ? COLORS.dangerSoft : COLORS.dangerDeep;

  const [blockedListOpen, setBlockedListOpen] = useState(false);
  // Your invites: read fresh when Settings opens and after the list closes; never kept on the phone.
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [invites, setInvites] = useState<{ line: string; count: number } | null>(null);
  useEffect(() => {
    if (invitesOpen) return;
    let live = true;
    void getMyInvites().then(({ data }) => {
      if (live && data) setInvites({ line: inviteSummary(data), count: inviteBadgeCount(data) });
    });
    return () => {
      live = false;
    };
  }, [invitesOpen]);
  // "Find friends in your contacts" (build 13+, no switch).
  const contactsFinder = useContactsFinder();
  const [findMatesOpen, setFindMatesOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Mahi sends no notifications while push is off: no row that leads nowhere until it's on.
  const pushOn = useFeatureFlag('push-core');
  // Public and private accounts: the Controls section (switch `private-accounts`).
  const controlsOn = useFeatureFlag('private-accounts');
  const [deleting, setDeleting] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            const { error } = await signOut();
            if (error) reportError(error, { flow: 'settings', action: 'signOut' });
            // App.tsx onAuthStateChange resets all stores + transitions to WelcomeScreen
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Apple requires in-app deletion. One plain confirmation; on success App.tsx's sign-out path
  // resets every store and shows the welcome screen.
  const handleDeleteAccount = () => {
    if (deleting) return;
    Alert.alert(
      DELETE_ACCOUNT_CONFIRM.title,
      DELETE_ACCOUNT_CONFIRM.message,
      [
        { text: DELETE_ACCOUNT_CONFIRM.cancel, style: 'cancel' },
        {
          text: DELETE_ACCOUNT_CONFIRM.confirm,
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await deleteAccount();
            if (error) {
              reportError(error, { flow: 'settings', action: 'deleteAccount' });
              setDeleting(false);
              Alert.alert('Couldn’t delete your account', error.message);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const rowStyle = ({ pressed }: { pressed: boolean }, divided: boolean) => [
    styles.row,
    divided && styles.rowDivider,
    { borderBottomColor: border },
    pressed && styles.pressed,
  ];

  // Every row here does something: a row with nothing behind it stays out until it's built.
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACE.s16 }]}>
        <View style={styles.titleRow}>
          {securityOpen ? (
            <Pressable
              onPress={() => setSecurityOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Back to settings"
              style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
            >
              <Text style={[styles.backText, { color: text }]}>‹</Text>
            </Pressable>
          ) : null}
          <Text style={[styles.title, { color: text }]} accessibilityRole="header">
            {securityOpen ? 'Security and privacy' : 'Settings'}
          </Text>
          {!securityOpen ? (
            <View
              style={[styles.headerIcon, { backgroundColor: iconSurface, borderColor: border }]}
            >
              <ThemeToggle color={text} size={SIZE.z20} />
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: iconSurface, borderColor: border },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.closeText, { color: text }]}>×</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.s24 }]}
        showsVerticalScrollIndicator={false}
      >
        {securityOpen ? (
          <>
            <Text style={[styles.sectionLabel, { color: muted }]}>Privacy</Text>
            <View style={[styles.group, { backgroundColor: surface, borderColor: border }]}>
              <Pressable
                style={(state) => rowStyle(state, false)}
                onPress={() => setBlockedListOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Blocked users"
              >
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowLabel, { color: text }]}>Blocked users</Text>
                  <Text style={[styles.rowDetail, { color: muted }]}>
                    Review who cannot contact you
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: muted }]}>›</Text>
              </Pressable>
            </View>

            <View style={styles.spacer} />
            <Text style={[styles.sectionLabel, { color: muted }]}>Account access</Text>
            <View style={[styles.group, { backgroundColor: surface, borderColor: border }]}>
              <Pressable
                style={(state) => rowStyle(state, true)}
                onPress={handleLogout}
                accessibilityRole="button"
                accessibilityLabel="Log out"
              >
                <Text style={[styles.rowLabel, { color: text }]}>Log out</Text>
                <Text style={[styles.chevron, { color: muted }]}>›</Text>
              </Pressable>
              <Pressable
                style={(state) => rowStyle(state, false)}
                onPress={handleDeleteAccount}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Delete account"
                accessibilityState={{ disabled: deleting, busy: deleting }}
              >
                <Text style={[styles.rowLabel, { color: danger }]}>
                  {deleting ? 'Deleting your account…' : 'Delete account'}
                </Text>
                <Text style={[styles.chevron, { color: danger }]}>›</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: muted }]}>Friends</Text>
            <View style={[styles.group, { backgroundColor: surface, borderColor: border }]}>
              {contactsFinder ? (
                <Pressable
                  style={(state) => rowStyle(state, true)}
                  onPress={() => setFindMatesOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Find friends in your contacts"
                >
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowLabel, { color: text }]}>
                      Find friends in your contacts
                    </Text>
                    <Text style={[styles.rowDetail, { color: muted }]}>
                      See who from your contacts is on Mahi
                    </Text>
                  </View>
                  <Text style={[styles.chevron, { color: muted }]}>›</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={(state) => rowStyle(state, false)}
                onPress={() => setInvitesOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={
                  invites?.count ? `Your invites, ${invites.count}` : 'Your invites'
                }
              >
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowLabel, { color: text }]}>Your invites</Text>
                  <Text style={[styles.rowDetail, { color: muted }]}>
                    {invites?.line ?? 'Who you invited and who joined'}
                  </Text>
                </View>
                <CountBadge count={invites?.count ?? 0} />
                <Text style={[styles.chevron, { color: muted }]}>›</Text>
              </Pressable>
            </View>

            {controlsOn ? (
              <ControlsSection dark={dark} rowStyle={rowStyle} surface={surface} />
            ) : null}

            <View style={styles.spacer} />
            <Text style={[styles.sectionLabel, { color: muted }]}>Preferences</Text>
            <View style={[styles.group, { backgroundColor: surface, borderColor: border }]}>
              {pushOn ? (
                <Pressable
                  style={(state) => rowStyle(state, true)}
                  onPress={() => void Linking.openSettings()}
                  accessibilityRole="button"
                  accessibilityLabel="Notification settings"
                >
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowLabel, { color: text }]}>Notifications</Text>
                    <Text style={[styles.rowDetail, { color: muted }]}>
                      Manage alerts on this phone
                    </Text>
                  </View>
                  <Text style={[styles.chevron, { color: muted }]}>›</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={(state) => rowStyle(state, false)}
                onPress={() => setSecurityOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Security and privacy"
              >
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowLabel, { color: text }]}>Security and privacy</Text>
                  <Text style={[styles.rowDetail, { color: muted }]}>
                    Blocks, account access and deletion
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: muted }]}>›</Text>
              </Pressable>
            </View>

            <View style={styles.spacer} />
            <Text style={[styles.sectionLabel, { color: muted }]}>Support</Text>
            <View style={[styles.group, { backgroundColor: surface, borderColor: border }]}>
              <Pressable
                style={(state) => rowStyle(state, false)}
                onPress={() => setHelpOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Help"
                accessibilityHint="Shows how Mahi works"
              >
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowLabel, { color: text }]}>Help</Text>
                  <Text style={[styles.rowDetail, { color: muted }]}>
                    See how tags and points work
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: muted }]}>›</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Version line: v{runtime} {build}.{OTA} — see the version-control skill */}
        <Text style={[styles.versionText, { color: muted }]}>{VERSION_LINE}</Text>
      </ScrollView>

      {/* Opened from inside this sheet so they present over it. */}
      <MyInvitesSheet visible={invitesOpen} onClose={() => setInvitesOpen(false)} dark={dark} />
      <FindMatesSheet visible={findMatesOpen} onClose={() => setFindMatesOpen(false)} dark={dark} />
      <BlockedUsersSheet
        visible={blockedListOpen}
        onClose={() => setBlockedListOpen(false)}
        dark={dark}
      />

      {helpOpen ? (
        <SafeAreaInsetsContext.Provider value={screenInsets}>
          <WelcomeCardsModal replay onClose={() => setHelpOpen(false)} />
        </SafeAreaInsetsContext.Provider>
      ) : null}
    </View>
  );
}

type RowStyle = (state: { pressed: boolean }, divided: boolean) => StyleProp<ViewStyle>;

/**
 * Settings → Controls (owner, 2026-10-08; server: 20261008170000_private_accounts): public or
 * private, who sees your workouts, who can tag you, your followers and follow requests. Each
 * change shows at once and the server's saved answer replaces it; the server enforces every rule.
 * Hidden on a server without the columns (the profile has no `is_private`).
 */
function ControlsSection({
  dark,
  rowStyle,
  surface,
}: {
  dark: boolean;
  rowStyle: RowStyle;
  surface: string;
}): React.JSX.Element | null {
  const { text, muted, border } = themeColors(dark);
  const profile = useUserStore((s) => s.profile);
  const isPrivate = profile?.is_private;
  const [saving, setSaving] = useState(false);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  // The count beside "Follow requests": read fresh while Settings is open, never kept.
  const { requests } = useFollowRequests(isPrivate === true && !requestsOpen);
  const show = useToastStore((st) => st.show);

  if (!profile || isPrivate === undefined) return null;
  const visibility = effectiveVisibility(isPrivate, profile.posts_visibility ?? 'everyone');
  const tagPermission = profile.tag_permission ?? 'approve';

  const save = async (patch: Partial<AccountControls>) => {
    setSaving(true);
    const { error, acceptedRequests } = await useUserStore.getState().saveControls(patch);
    setSaving(false);
    if (error) {
      reportError(error, {
        flow: 'settings',
        action: 'saveControls',
        level: 'warning',
        extra: { rpc: 'set_account_controls', keys: Object.keys(patch) },
      });
      show('Couldn’t save that. Try again.');
      return;
    }
    if (acceptedRequests) {
      show(
        acceptedRequests === 1
          ? '1 follow request accepted.'
          : `${acceptedRequests} follow requests accepted.`
      );
    }
  };

  // Public ↔ private asks first: it changes who sees your workouts (and going public accepts
  // every waiting request).
  const chooseAccount = (toPrivate: boolean) => {
    const ask = privacyConfirm(toPrivate);
    Alert.alert(ask.title, ask.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: ask.confirm, onPress: () => void save(accountSwitchPatch(toPrivate)) },
    ]);
  };

  return (
    <>
      <View style={styles.spacer} />
      <Text style={[styles.sectionLabel, { color: muted }]}>Controls</Text>
      <View style={[styles.group, { backgroundColor: surface, borderColor: border }]}>
        <View style={[styles.control, styles.rowDivider, { borderBottomColor: border }]}>
          <Text style={[styles.rowLabel, { color: text }]}>Account</Text>
          <SegmentedControl
            label="Account"
            dark={dark}
            disabled={saving}
            options={ACCOUNT_OPTIONS}
            value={isPrivate}
            onChange={chooseAccount}
          />
          <Text style={[styles.rowDetail, { color: muted }]}>{accountDescription(isPrivate)}</Text>
        </View>

        <View style={[styles.control, styles.rowDivider, { borderBottomColor: border }]}>
          <Text style={[styles.rowLabel, { color: text }]}>Who can see your workouts</Text>
          <SegmentedControl
            label="Who can see your workouts"
            dark={dark}
            disabled={saving}
            options={WORKOUT_OPTIONS.map((o) => ({
              ...o,
              disabled: workoutOptionDisabled(isPrivate, o.value),
            }))}
            value={visibility}
            onChange={(v) => void save({ posts_visibility: v })}
          />
          <Text style={[styles.rowDetail, { color: muted }]}>
            {workoutsDescription(visibility)}
          </Text>
        </View>

        <View style={[styles.control, styles.rowDivider, { borderBottomColor: border }]}>
          <Text style={[styles.rowLabel, { color: text }]}>Who can tag you</Text>
          <SegmentedControl
            label="Who can tag you"
            dark={dark}
            disabled={saving}
            options={TAG_OPTIONS}
            value={tagPermission}
            onChange={(v) => void save({ tag_permission: v })}
          />
          <Text style={[styles.rowDetail, { color: muted }]}>{tagDescription(tagPermission)}</Text>
        </View>

        <Pressable
          style={(state) => rowStyle(state, isPrivate)}
          onPress={() => setFollowersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Followers"
        >
          <View style={styles.rowCopy}>
            <Text style={[styles.rowLabel, { color: text }]}>Followers</Text>
            <Text style={[styles.rowDetail, { color: muted }]}>
              See who follows you, and remove anyone
            </Text>
          </View>
          <Text style={[styles.chevron, { color: muted }]}>›</Text>
        </Pressable>

        {isPrivate ? (
          <Pressable
            style={(state) => rowStyle(state, false)}
            onPress={() => setRequestsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={
              requests?.length ? `Follow requests, ${requests.length}` : 'Follow requests'
            }
          >
            <View style={styles.rowCopy}>
              <Text style={[styles.rowLabel, { color: text }]}>Follow requests</Text>
              <Text style={[styles.rowDetail, { color: muted }]}>People asking to follow you</Text>
            </View>
            <CountBadge count={requests?.length ?? 0} />
            <Text style={[styles.chevron, { color: muted }]}>›</Text>
          </Pressable>
        ) : null}
      </View>

      <FollowListModal
        visible={followersOpen}
        onClose={() => setFollowersOpen(false)}
        userId={profile.id}
        type="followers"
        dark={dark}
      />
      <FollowRequestsSheet
        visible={requestsOpen}
        onClose={() => setRequestsOpen(false)}
        dark={dark}
      />
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
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s20,
    paddingBottom: SPACE.s20,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
  },
  headerIcon: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: FONT_SIZE.f22,
    fontFamily: FONTS.regular,
  },
  closeBtn: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
  pressedMore: {
    opacity: ALPHA.a60,
  },
  content: {
    flexGrow: 1,
    paddingTop: SPACE.s20,
  },
  sectionLabel: {
    marginHorizontal: SPACE.s24,
    marginBottom: SPACE.s8,
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f12,
  },
  group: {
    marginHorizontal: SPACE.s20,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r20,
    overflow: 'hidden',
  },
  row: {
    minHeight: SIZE.z72,
    paddingVertical: SPACE.s14,
    paddingHorizontal: SPACE.s16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.s12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // A control with its title above and what the choice means below.
  control: {
    paddingVertical: SPACE.s14,
    paddingHorizontal: SPACE.s16,
    gap: SPACE.s8,
  },
  rowCopy: {
    flex: 1,
    gap: SPACE.s3,
  },
  rowLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
  },
  rowDetail: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f12,
  },
  chevron: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f22,
  },
  spacer: {
    flex: 1,
    minHeight: SIZE.z48,
  },
  logoutBtn: {
    marginHorizontal: SPACE.s20,
    marginBottom: SPACE.s8,
    paddingVertical: SPACE.s14,
    borderRadius: RADIUS.r20,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
  },
  deleteBtn: {
    marginHorizontal: SPACE.s24,
    paddingVertical: SPACE.s14,
    alignItems: 'center',
  },
  deleteText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
  },
  versionText: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f11,
    textAlign: 'center',
    marginTop: SPACE.s12,
    letterSpacing: TRACKING.t1,
  },
});
