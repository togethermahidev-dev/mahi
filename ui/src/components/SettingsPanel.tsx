import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  SECURITY_ROW,
  TAG_OPTIONS,
  accountSwitchPatch,
  WORKOUT_OPTIONS,
  accountDescription,
  effectiveVisibility,
  privacyConfirm,
  securityRowLabel,
  tagDescription,
  workoutOptionDisabled,
  workoutsDescription,
  type AccountControls,
} from '@/lib/accountControls';
import { GLYPH, TYPOGRAPHY } from '@/constants/typography';
import { COLORS, ALPHA, BORDER_WIDTH, RADIUS, SIZE, SPACE } from '@/constants/tokens';
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
  const { text, muted, border } = themeColors(dark);
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const circle = {
    backgroundColor: dark ? COLORS.surfaceDark2 : COLORS.surfaceLight,
    borderColor: border,
  };

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
  // The page behind "Security and privacy": privacy controls, then account access.
  const [securityOpen, setSecurityOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Mahi sends no notifications while push is off: no row that leads nowhere until it's on.
  const pushOn = useFeatureFlag('push-core');
  // Public and private accounts: the privacy controls (switch `private-accounts`).
  const controlsOn = useFeatureFlag('private-accounts');
  const [deleting, setDeleting] = useState(false);
  // Follow requests to a private account: read fresh while Settings is open, never kept. The
  // number shows on the row that leads to them here, and beside "Follow requests" on its page.
  const privateAccount = useUserStore((s) => s.profile?.is_private) === true;
  const [requestsOpen, setRequestsOpen] = useState(false);
  const { requests } = useFollowRequests(controlsOn && privateAccount && !requestsOpen);
  const requestCount = controlsOn && privateAccount ? (requests?.length ?? 0) : 0;

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

  // Every row here does something: a row with nothing behind it stays out until it's built.
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACE.s16 }]}>
        {securityOpen ? (
          <>
            <Pressable
              onPress={() => setSecurityOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Back to settings"
              style={({ pressed }) => [styles.headerButton, circle, pressed && styles.pressed]}
            >
              <Text style={[styles.glyph, { color: text }]}>‹</Text>
            </Pressable>
            <Text
              style={[styles.pageTitle, { color: text }]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {SECURITY_ROW.title}
            </Text>
          </>
        ) : (
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, { color: text }]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              Settings
            </Text>
            <View style={[styles.headerButton, circle]}>
              <ThemeToggle color={text} size={SIZE.z20} />
            </View>
          </View>
        )}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          style={({ pressed }) => [styles.headerButton, circle, pressed && styles.pressed]}
        >
          <Text style={[styles.glyph, { color: text }]}>×</Text>
        </Pressable>
      </View>

      {/* Keyed by page, so each page opens at its top, not where the other was scrolled to. */}
      <ScrollView
        key={securityOpen ? 'security' : 'settings'}
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.s24 }]}
        showsVerticalScrollIndicator={false}
      >
        {securityOpen ? (
          <>
            <PrivacySection
              dark={dark}
              controlsOn={controlsOn}
              requestCount={requestCount}
              onOpenRequests={() => setRequestsOpen(true)}
              onOpenBlocked={() => setBlockedListOpen(true)}
            />
            <Section title="Account access" dark={dark}>
              <Row title="Log out" onPress={handleLogout} dark={dark} />
              <Row
                title={deleting ? 'Deleting your account…' : 'Delete account'}
                label="Delete account"
                onPress={handleDeleteAccount}
                busy={deleting}
                danger
                dark={dark}
              />
            </Section>
          </>
        ) : (
          <>
            <Section title="Friends" dark={dark}>
              {contactsFinder ? (
                <Row
                  title="Find friends in your contacts"
                  detail="See who from your contacts is on Mahi"
                  onPress={() => setFindMatesOpen(true)}
                  dark={dark}
                />
              ) : null}
              <Row
                title="Your invites"
                detail={invites?.line ?? 'Who you invited and who joined'}
                label={invites?.count ? `Your invites, ${invites.count}` : 'Your invites'}
                count={invites?.count}
                onPress={() => setInvitesOpen(true)}
                dark={dark}
              />
            </Section>

            <Section title="Preferences" dark={dark}>
              {pushOn ? (
                <Row
                  title="Notifications"
                  detail="Manage alerts on this phone"
                  label="Notification settings"
                  onPress={() => void Linking.openSettings()}
                  dark={dark}
                />
              ) : null}
              <Row
                title={SECURITY_ROW.title}
                detail={SECURITY_ROW.detail}
                label={securityRowLabel(requestCount)}
                count={requestCount}
                onPress={() => setSecurityOpen(true)}
                dark={dark}
              />
            </Section>

            <Section title="Support" dark={dark}>
              <Row
                title="Help"
                detail="See how tags and points work"
                hint="Shows how Mahi works"
                onPress={() => setHelpOpen(true)}
                dark={dark}
              />
            </Section>
          </>
        )}

        {/* Version line: v{runtime} {build}.{OTA} — see the version-control skill */}
        <Text style={[styles.version, { color: muted }]}>{VERSION_LINE}</Text>
      </ScrollView>

      {/* Opened from inside this sheet so they present over it. */}
      <MyInvitesSheet visible={invitesOpen} onClose={() => setInvitesOpen(false)} dark={dark} />
      <FindMatesSheet visible={findMatesOpen} onClose={() => setFindMatesOpen(false)} dark={dark} />
      <BlockedUsersSheet
        visible={blockedListOpen}
        onClose={() => setBlockedListOpen(false)}
        dark={dark}
      />
      <FollowRequestsSheet
        visible={requestsOpen}
        onClose={() => setRequestsOpen(false)}
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

/** A headed card of rows, with a hairline between one row and the next. */
function Section({
  title,
  dark,
  children,
}: {
  title: string;
  dark: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const { muted, border } = themeColors(dark);
  const surface = dark ? COLORS.surfaceDark : COLORS.paper;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionHeader, { color: muted }]} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.group, { backgroundColor: surface, borderColor: border }]}>
        {/* Rows that are switched off (null) drop out here, so no line is left behind. */}
        {React.Children.toArray(children).map((row, i) => (
          <View
            key={React.isValidElement(row) ? row.key : i}
            style={i > 0 && [styles.divided, { borderTopColor: border }]}
          >
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The one row: a title, a second line where there is more to say, and a chevron. */
function Row({
  title,
  detail,
  onPress,
  dark,
  count = 0,
  label = title,
  hint,
  danger = false,
  busy = false,
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  dark: boolean;
  /** A number waiting behind the row (invites, follow requests); nothing at 0. */
  count?: number;
  /** What VoiceOver calls the row, where that isn't its title. */
  label?: string;
  hint?: string;
  /** It deletes something. */
  danger?: boolean;
  /** Its action is on its way: the row waits. */
  busy?: boolean;
}): React.JSX.Element {
  const { text, muted } = themeColors(dark);
  const dangerText = dark ? COLORS.dangerSoft : COLORS.dangerDeep;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: busy, busy }}
    >
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: danger ? dangerText : text }]}>{title}</Text>
        {detail ? <Text style={[styles.detail, { color: muted }]}>{detail}</Text> : null}
      </View>
      <CountBadge count={count} />
      <Text style={[styles.glyph, { color: danger ? dangerText : muted }]}>›</Text>
    </Pressable>
  );
}

/** A control in a card: what it sets, the control, and what the chosen option means. */
function Control({
  title,
  helper,
  dark,
  children,
}: {
  title: string;
  helper: string;
  dark: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const { text, muted } = themeColors(dark);
  return (
    <View style={styles.control}>
      <Text style={[styles.controlTitle, { color: text }]}>{title}</Text>
      {children}
      <Text style={[styles.detail, { color: muted }]}>{helper}</Text>
    </View>
  );
}

/**
 * Settings → Security and privacy → Privacy controls (owner, 2026-10-10: off the main list;
 * built 2026-10-08, server: 20261008170000_private_accounts): public or private, who sees your
 * workouts, who can tag you, your followers and follow requests, then who you blocked. Each
 * change shows at once and the server's saved answer replaces it; the server enforces every rule.
 * With the switch off, or on a server without the columns (the profile has no `is_private`),
 * only Blocked users shows.
 */
function PrivacySection({
  dark,
  controlsOn,
  requestCount,
  onOpenRequests,
  onOpenBlocked,
}: {
  dark: boolean;
  controlsOn: boolean;
  requestCount: number;
  onOpenRequests: () => void;
  onOpenBlocked: () => void;
}): React.JSX.Element {
  const profile = useUserStore((s) => s.profile);
  const isPrivate = profile?.is_private;
  const [saving, setSaving] = useState(false);
  const [followersOpen, setFollowersOpen] = useState(false);
  const show = useToastStore((st) => st.show);

  const blocked = (
    <Row
      title="Blocked users"
      detail="Review who cannot contact you"
      onPress={onOpenBlocked}
      dark={dark}
    />
  );
  if (!controlsOn || !profile || isPrivate === undefined) {
    return (
      <Section title="Privacy controls" dark={dark}>
        {blocked}
      </Section>
    );
  }
  const visibility = effectiveVisibility(isPrivate, profile.posts_visibility ?? 'followers');
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
      <Section title="Privacy controls" dark={dark}>
        {/* No VoiceOver hint per option here: what Public means depends on the workouts choice
            below, so only the line under the control says it. */}
        <Control title="Account" helper={accountDescription(isPrivate, visibility)} dark={dark}>
          <SegmentedControl
            label="Account"
            dark={dark}
            disabled={saving}
            options={ACCOUNT_OPTIONS}
            value={isPrivate}
            onChange={chooseAccount}
          />
        </Control>

        <Control
          title="Who can see your workouts"
          helper={workoutsDescription(visibility)}
          dark={dark}
        >
          <SegmentedControl
            label="Who can see your workouts"
            dark={dark}
            disabled={saving}
            options={WORKOUT_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              hint: o.description,
              disabled: workoutOptionDisabled(isPrivate, o.value),
            }))}
            value={visibility}
            onChange={(v) => void save({ posts_visibility: v })}
          />
        </Control>

        <Control title="Who can tag you" helper={tagDescription(tagPermission)} dark={dark}>
          <SegmentedControl
            label="Who can tag you"
            dark={dark}
            disabled={saving}
            options={TAG_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              hint: o.description,
            }))}
            value={tagPermission}
            onChange={(v) => void save({ tag_permission: v })}
          />
        </Control>

        <Row
          title="Followers"
          detail="See who follows you, and remove anyone"
          onPress={() => setFollowersOpen(true)}
          dark={dark}
        />

        {isPrivate ? (
          <Row
            title="Follow requests"
            detail="People asking to follow you"
            label={requestCount ? `Follow requests, ${requestCount}` : 'Follow requests'}
            count={requestCount}
            onPress={onOpenRequests}
            dark={dark}
          />
        ) : null}

        {blocked}
      </Section>

      <FollowListModal
        visible={followersOpen}
        onClose={() => setFollowersOpen(false)}
        userId={profile.id}
        type="followers"
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
    gap: SPACE.s12,
    paddingHorizontal: SPACE.s20,
    paddingBottom: SPACE.s20,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
  },
  // The main page's title.
  title: {
    ...TYPOGRAPHY.screenTitle,
    flexShrink: 1,
  },
  // A page opened from the main one: its title sits centred between Back and Close.
  pageTitle: {
    ...TYPOGRAPHY.sheetTitle,
    flex: 1,
    textAlign: 'center',
  },
  // The round buttons in the header: back, light or dark, close.
  headerButton: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A character drawn as an icon: the back and close marks, a row's chevron.
  glyph: {
    ...GLYPH.icon,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
  // The cards stack, one gap between each; they don't spread to fill.
  content: {
    flexGrow: 1,
    paddingTop: SPACE.s20,
    gap: SPACE.s24,
  },
  section: {
    gap: SPACE.s8,
  },
  sectionHeader: {
    ...TYPOGRAPHY.sectionHeader,
    marginHorizontal: SPACE.s24,
  },
  group: {
    marginHorizontal: SPACE.s20,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r20,
    overflow: 'hidden',
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    minHeight: SIZE.z72,
    paddingVertical: SPACE.s14,
    paddingHorizontal: SPACE.s16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
  },
  rowCopy: {
    flex: 1,
    gap: SPACE.s3,
  },
  rowTitle: {
    ...TYPOGRAPHY.body,
  },
  control: {
    paddingVertical: SPACE.s14,
    paddingHorizontal: SPACE.s16,
    gap: SPACE.s8,
  },
  controlTitle: {
    ...TYPOGRAPHY.bodyStrong,
  },
  // A row's second line, and the line under a control saying what the choice means.
  detail: {
    ...TYPOGRAPHY.caption,
  },
  version: {
    ...TYPOGRAPHY.caption,
    textAlign: 'center',
  },
});
