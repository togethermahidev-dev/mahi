import React, { useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { deleteAccount, signOut } from '@/api/auth';
import { DELETE_ACCOUNT_CONFIRM } from '@/lib/account';
import { VERSION_LINE } from '@/lib/appBuild';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import BlockedUsersSheet from '@/components/BlockedUsersSheet';
import { WelcomeCardsModal } from '@/components/WelcomeCards';
import ThemeToggle from '@/components/ThemeToggle';
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
  const [securityOpen, setSecurityOpen] = useState(false);
  const deleteEnabled = useFeatureFlag('account-delete');
  // Help shows the welcome cards again, so it follows their switch.
  const helpEnabled = useFeatureFlag('onboarding-welcome-cards');
  const [helpOpen, setHelpOpen] = useState(false);
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
            await signOut();
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
                style={(state) => rowStyle(state, deleteEnabled)}
                onPress={handleLogout}
                accessibilityRole="button"
                accessibilityLabel="Log out"
              >
                <Text style={[styles.rowLabel, { color: text }]}>Log out</Text>
                <Text style={[styles.chevron, { color: muted }]}>›</Text>
              </Pressable>
              {deleteEnabled ? (
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
              ) : null}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: muted }]}>Preferences</Text>
            <View style={[styles.group, { backgroundColor: surface, borderColor: border }]}>
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

            {helpEnabled ? (
              <>
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
            ) : null}
          </>
        )}

        {/* Version line: v{runtime} {build}.{OTA} — see the version-control skill */}
        <Text style={[styles.versionText, { color: muted }]}>{VERSION_LINE}</Text>
      </ScrollView>

      {/* Opened from inside this sheet so they present over it. */}
      <BlockedUsersSheet
        visible={blockedListOpen}
        onClose={() => setBlockedListOpen(false)}
        dark={dark}
      />

      {helpOpen ? (
        <SafeAreaInsetsContext.Provider value={screenInsets}>
          <WelcomeCardsModal onClose={() => setHelpOpen(false)} />
        </SafeAreaInsetsContext.Provider>
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
