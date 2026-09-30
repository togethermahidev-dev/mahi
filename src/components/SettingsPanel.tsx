import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { signOut } from '@/api/auth';
import { VERSION_LINE } from '@/lib/appBuild';
import BlockedUsersSheet from '@/components/BlockedUsersSheet';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS, SHADOW_BLUR, SIZE, OFFSET, TRACKING, BORDER_WIDTH } from '@/constants/tokens';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PANEL_WIDTH = SCREEN_WIDTH * 0.82;

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

  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [accountOpen, setAccountOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const accountAnim = useRef(new Animated.Value(0)).current;
  const privacyAnim = useRef(new Animated.Value(0)).current;

  const [mounted, setMounted] = useState(false);
  const [blockedListOpen, setBlockedListOpen] = useState(false);

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
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
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

  if (!mounted && !visible) return null;

  const accountSubItems = [
    'Edit Profile',
    'Update Bio & Link',
    'User Controls',
    'Safety & Privacy',
    'Delete Account',
  ];

  const privacySubItems = ['T&Cs', 'Privacy Policy', 'Request My Personal Data'];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { backgroundColor: backdropColor, opacity: backdropAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[styles.panel, { backgroundColor: panelBg, transform: [{ translateX: slideAnim }] }]}
      >
        {/* Close button */}
        <View
          style={[
            styles.closeRow,
            { borderBottomColor: border, paddingTop: Platform.OS === 'ios' ? SPACE.s60 : SPACE.s32 },
          ]}
        >
          <Text style={[styles.panelTitle, { color: text }]}>SETTINGS</Text>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { borderColor: muted }]}
            hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
          >
            <Text style={[styles.closeBtnText, { color: muted }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Account Settings accordion ── */}
          <TouchableOpacity
            style={[styles.sectionRow, { borderBottomColor: border }]}
            onPress={() => toggleAccordion(accountOpen, setAccountOpen, accountAnim)}
            activeOpacity={0.7}
          >
            <Text style={[styles.sectionLabel, { color: text }]}>ACCOUNT SETTINGS</Text>
            <ChevronIcon open={accountAnim} color={muted} />
          </TouchableOpacity>

          <Animated.View
            style={{
              maxHeight: accountAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, accountSubItems.length * 50],
              }),
              overflow: 'hidden',
            }}
          >
            {accountSubItems.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.subRow, { borderBottomColor: border }]}
                activeOpacity={0.7}
                onPress={() => {
                  if (item === 'User Controls') setBlockedListOpen(true);
                }}
              >
                <Text style={[styles.subLabel, { color: muted }]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          {/* ── Help & FAQ ── */}
          <TouchableOpacity
            style={[styles.sectionRow, { borderBottomColor: border }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.sectionLabel, { color: text }]}>HELP & FAQ</Text>
          </TouchableOpacity>

          {/* ── Privacy & Data accordion ── */}
          <TouchableOpacity
            style={[styles.sectionRow, { borderBottomColor: border }]}
            onPress={() => toggleAccordion(privacyOpen, setPrivacyOpen, privacyAnim)}
            activeOpacity={0.7}
          >
            <Text style={[styles.sectionLabel, { color: text }]}>PRIVACY & DATA</Text>
            <ChevronIcon open={privacyAnim} color={muted} />
          </TouchableOpacity>

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
              <TouchableOpacity
                key={item}
                style={[styles.subRow, { borderBottomColor: border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.subLabel, { color: muted }]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          {/* Spacer */}
          <View style={styles.spacer} />

          {/* Log Out */}
          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: muted }]}
            onPress={handleLogout}
            activeOpacity={0.6}
          >
            <Text style={[styles.logoutText, { color: muted }]}>LOG OUT</Text>
          </TouchableOpacity>

          {/* Version line: v{runtime} {build}.{OTA} — see the version-control skill */}
          <Text style={[styles.versionText, { color: muted }]}>{VERSION_LINE}</Text>
        </ScrollView>
      </Animated.View>

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
    fontSize: FONT_SIZE.f13,
    letterSpacing: TRACKING.t5,
  },
  closeBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: FONT_SIZE.f11,
    letterSpacing: TRACKING.t3,
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
    fontSize: FONT_SIZE.f11,
    letterSpacing: TRACKING.t3,
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
