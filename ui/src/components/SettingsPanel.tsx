import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const { muted, border } = themeColors(dark);
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const danger = dark ? COLORS.dangerSoft : COLORS.dangerDeep;

  const [blockedListOpen, setBlockedListOpen] = useState(false);
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

  const rowStyle = ({ pressed }: { pressed: boolean }) => [
    styles.row,
    { borderBottomColor: border },
    pressed && styles.pressed,
  ];

  // Every row here does something: a row with nothing behind it stays out until it's built.
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View
        style={[styles.header, { borderBottomColor: border, paddingTop: insets.top + SPACE.s16 }]}
      >
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Settings
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
        >
          <View style={[styles.closeRing, { borderColor: muted }]}>
            <Text style={[styles.closeText, { color: muted }]}>×</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.s24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={rowStyle}
          onPress={() => setBlockedListOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Blocked users"
        >
          <Text style={[styles.rowLabel, { color: text }]}>Blocked users</Text>
        </Pressable>

        {helpEnabled ? (
          <Pressable
            style={rowStyle}
            onPress={() => setHelpOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Help"
            accessibilityHint="Shows how Mahi works"
          >
            <Text style={[styles.rowLabel, { color: text }]}>Help</Text>
          </Pressable>
        ) : null}

        <View style={styles.spacer} />

        <Pressable
          style={({ pressed }) => [
            styles.logoutBtn,
            { borderColor: muted },
            pressed && styles.pressedMore,
          ]}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Text style={[styles.logoutText, { color: muted }]}>Log out</Text>
        </Pressable>

        {deleteEnabled ? (
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
            onPress={handleDeleteAccount}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            accessibilityState={{ disabled: deleting, busy: deleting }}
          >
            <Text style={[styles.deleteText, { color: danger }]}>
              {deleting ? 'Deleting your account…' : 'Delete account'}
            </Text>
          </Pressable>
        ) : null}

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
    paddingLeft: SPACE.s24,
    paddingRight: SPACE.s16,
    paddingBottom: SPACE.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f17,
  },
  // A 44-point tap area around the 36-point ring.
  closeBtn: {
    width: SIZE.z44,
    height: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeRing: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
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
  },
  row: {
    paddingVertical: SPACE.s18,
    paddingHorizontal: SPACE.s24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
  },
  spacer: {
    flex: 1,
    minHeight: SIZE.z48,
  },
  logoutBtn: {
    marginHorizontal: SPACE.s24,
    marginBottom: SPACE.s8,
    paddingVertical: SPACE.s14,
    borderRadius: RADIUS.r50,
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
