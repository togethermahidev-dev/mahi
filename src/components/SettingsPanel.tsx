import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteAccount, signOut } from '@/api/auth';
import { DELETE_ACCOUNT_CONFIRM } from '@/lib/account';
import { VERSION_LINE } from '@/lib/appBuild';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import BlockedUsersSheet from '@/components/BlockedUsersSheet';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS, SHADOW_BLUR, SIZE, OFFSET, TRACKING, BORDER_WIDTH } from '@/constants/tokens';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PANEL_WIDTH = SCREEN_WIDTH * 0.82;
// A left swipe past a third of the panel, or a quick flick, closes it.
const SWIPE_CLOSE_DISTANCE = PANEL_WIDTH / 3;
const SWIPE_CLOSE_VELOCITY = 500;

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  dark: boolean;
}

function ChevronIcon({ open, color }: { open: Animated.Value; color: string }) {
  const rotate = open.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  return (
    <Animated.Text style={[{ color, fontSize: FONT_SIZE.f12, transform: [{ rotate }] }]}>▼</Animated.Text>
  );
}

export default function SettingsPanel({
  visible,
  onClose,
  dark,
}: SettingsPanelProps): React.JSX.Element | null {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.08) : withAlpha(COLORS.offBlack, 0.06);
  const panelBg = dark ? COLORS.bgDark : COLORS.white;
  const backdropColor = dark ? withAlpha(COLORS.black, 0.6) : withAlpha(COLORS.black, 0.4);
  const danger = dark ? COLORS.dangerSoft : COLORS.dangerDeep;

  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [accountOpen, setAccountOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const accountAnim = useRef(new Animated.Value(0)).current;
  const privacyAnim = useRef(new Animated.Value(0)).current;

  const [mounted, setMounted] = useState(false);
  const [blockedListOpen, setBlockedListOpen] = useState(false);
  const deleteEnabled = useFeatureFlag('account-delete');
  const [deleting, setDeleting] = useState(false);
  const insets = useSafeAreaInsets();

  // Android back closes the drawer (the blocked-users sheet handles its own back press).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // Swipe left to close: the panel follows the finger, then closes or springs back.
  const swipeToClose = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX(-SPACE.s12)
    .failOffsetY([-SPACE.s12, SPACE.s12])
    .onUpdate((e) => {
      slideAnim.setValue(Math.min(0, e.translationX));
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_CLOSE_DISTANCE || e.velocityX < -SWIPE_CLOSE_VELOCITY) {
        onClose();
        return;
      }
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    });

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 160,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -PANEL_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMounted(false);
        setAccountOpen(false);
        setPrivacyOpen(false);
        accountAnim.setValue(0);
        privacyAnim.setValue(0);
      });
    }
  }, [visible]);

  const toggleAccordion = (
    isOpen: boolean,
    setOpen: (v: boolean) => void,
    anim: Animated.Value
  ) => {
    const next = !isOpen;
    setOpen(next);
    Animated.spring(anim, {
      toValue: next ? 1 : 0,
      damping: 22,
      stiffness: 160,
      mass: 0.9,
      useNativeDriver: false,
    }).start();
  };

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

  if (!mounted && !visible) return null;

  const accountSubItems = [
    'Edit profile',
    'Update bio & link',
    'Blocked users',
    'Safety & privacy',
    ...(deleteEnabled ? ['Delete account'] : []),
  ];

  const privacySubItems = ['T&Cs', 'Privacy policy', 'Request my personal data'];

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessibilityViewIsModal={visible}
      onAccessibilityEscape={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { backgroundColor: backdropColor, opacity: backdropAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
        />
      </Animated.View>

      {/* Panel */}
      <GestureDetector gesture={swipeToClose}>
        <Animated.View
          style={[styles.panel, { backgroundColor: panelBg, transform: [{ translateX: slideAnim }] }]}
        >
          {/* Close button */}
          <View
            style={[
              styles.closeRow,
              { borderBottomColor: border, paddingTop: insets.top + SPACE.s8 },
            ]}
          >
            <Text style={[styles.panelTitle, { color: text }]} accessibilityRole="header">
              Settings
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              style={({ pressed }) => [styles.closeBtn, { borderColor: muted }, pressed && styles.pressed]}
              hitSlop={OFFSET.o8}
            >
              <Text style={[styles.closeBtnText, { color: muted }]}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Account Settings accordion ── */}
            <Pressable
              style={({ pressed }) => [styles.sectionRow, { borderBottomColor: border }, pressed && styles.pressed]}
              onPress={() => toggleAccordion(accountOpen, setAccountOpen, accountAnim)}
              accessibilityRole="button"
              accessibilityLabel="Account settings"
              accessibilityState={{ expanded: accountOpen }}
            >
              <Text style={[styles.sectionLabel, { color: text }]}>Account settings</Text>
              <ChevronIcon open={accountAnim} color={muted} />
            </Pressable>

            <Animated.View
              style={{
                maxHeight: accountAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, accountSubItems.length * 50],
                }),
                overflow: 'hidden',
              }}
            >
              {accountSubItems.map((item) => {
                const isDelete = item === 'Delete account';
                return (
                  <Pressable
                    key={item}
                    style={({ pressed }) => [styles.subRow, { borderBottomColor: border }, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={item}
                    accessibilityState={isDelete ? { disabled: deleting, busy: deleting } : undefined}
                    disabled={isDelete && deleting}
                    onPress={() => {
                      if (item === 'Blocked users') setBlockedListOpen(true);
                      if (isDelete) handleDeleteAccount();
                    }}
                  >
                    <Text style={[styles.subLabel, { color: isDelete ? danger : muted }]}>
                      {isDelete && deleting ? 'Deleting your account…' : item}
                    </Text>
                  </Pressable>
                );
              })}
            </Animated.View>

            {/* ── Help & FAQ ── */}
            <Pressable
              style={({ pressed }) => [styles.sectionRow, { borderBottomColor: border }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Help and FAQ"
            >
              <Text style={[styles.sectionLabel, { color: text }]}>Help & FAQ</Text>
            </Pressable>

            {/* ── Privacy & Data accordion ── */}
            <Pressable
              style={({ pressed }) => [styles.sectionRow, { borderBottomColor: border }, pressed && styles.pressed]}
              onPress={() => toggleAccordion(privacyOpen, setPrivacyOpen, privacyAnim)}
              accessibilityRole="button"
              accessibilityLabel="Privacy and data"
              accessibilityState={{ expanded: privacyOpen }}
            >
              <Text style={[styles.sectionLabel, { color: text }]}>Privacy & data</Text>
              <ChevronIcon open={privacyAnim} color={muted} />
            </Pressable>

            <Animated.View
              style={{
                maxHeight: privacyAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, privacySubItems.length * 50],
                }),
                overflow: 'hidden',
              }}
            >
              {privacySubItems.map((item) => (
                <Pressable
                  key={item}
                  style={({ pressed }) => [styles.subRow, { borderBottomColor: border }, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={item}
                >
                  <Text style={[styles.subLabel, { color: muted }]}>{item}</Text>
                </Pressable>
              ))}
            </Animated.View>

            {/* Spacer */}
            <View style={styles.spacer} />

            {/* Log Out */}
            <Pressable
              style={({ pressed }) => [styles.logoutBtn, { borderColor: muted }, pressed && styles.pressedMore]}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Text style={[styles.logoutText, { color: muted }]}>Log out</Text>
            </Pressable>

            {/* Version line: v{runtime} {build}.{OTA} — see the version-control skill */}
            <Text style={[styles.versionText, { color: muted }]}>{VERSION_LINE}</Text>
          </ScrollView>
        </Animated.View>
      </GestureDetector>

      {/* Blocked users list — opened from User Controls */}
      <BlockedUsersSheet
        visible={blockedListOpen}
        onClose={() => setBlockedListOpen(false)}
        dark={dark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PANEL_WIDTH,
    height: SCREEN_HEIGHT,
    zIndex: 400,
    shadowColor: COLORS.black,
    shadowOffset: { width: SIZE.z4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: SHADOW_BLUR.b12,
    elevation: 12,
  },
  closeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s24,
    paddingBottom: SPACE.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f17,
  },
  closeBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  pressedMore: {
    opacity: 0.6,
  },
  closeBtnText: {
    fontSize: FONT_SIZE.f14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACE.s40,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.s18,
    paddingHorizontal: SPACE.s24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
  },
  subRow: {
    paddingVertical: SPACE.s15,
    paddingLeft: SPACE.s40,
    paddingRight: SPACE.s24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subLabel: {
    fontFamily: FONTS.italic,
    fontSize: FONT_SIZE.f14,
  },
  spacer: {
    flex: 1,
    minHeight: SIZE.z48,
  },
  logoutBtn: {
    marginHorizontal: SPACE.s24,
    marginBottom: SPACE.s16,
    paddingVertical: SPACE.s14,
    borderRadius: RADIUS.r50,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
  },
  versionText: {
    fontFamily: FONTS.italic,
    fontSize: FONT_SIZE.f10,
    textAlign: 'center',
    marginTop: SPACE.s12,
    marginBottom: SPACE.s24,
    letterSpacing: TRACKING.t1,
  },
});
