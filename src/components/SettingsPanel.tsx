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
import Constants from 'expo-constants';
import BlockedUsersSheet from '@/components/BlockedUsersSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Version string pieces ──
// version  → app version from app.config.js (e.g. "0.1.0")
// build    → iOS buildNumber / Android versionCode from app.config.js (e.g. "9")
// OTA_NUMBER → over-the-air update number, bump this after each EAS Update push
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const BUILD_NUMBER = Constants.expoConfig?.ios?.buildNumber ?? '0';
const OTA_NUMBER = '05'; // ← bump after each OTA update
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
    <Animated.Text style={[{ color, fontSize: 12, transform: [{ rotate }] }]}>▼</Animated.Text>
  );
}

export default function SettingsPanel({
  visible,
  onClose,
  dark,
}: SettingsPanelProps): React.JSX.Element | null {
  const text   = dark ? '#E8E8E3' : '#1A1A17';
  const muted  = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const border = dark ? 'rgba(232,232,227,0.08)' : 'rgba(26,26,23,0.06)';
  const panelBg = dark ? '#1C1C19' : '#FFFFFF';
  const backdropColor = dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)';

  const slideAnim   = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [accountOpen, setAccountOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen]  = useState(false);
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
    anim: Animated.Value,
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
      { cancelable: true },
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

  const privacySubItems = [
    'T&Cs',
    'Privacy Policy',
    'Request My Personal Data',
  ];

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
        style={[
          styles.panel,
          { backgroundColor: panelBg, transform: [{ translateX: slideAnim }] },
        ]}
      >
        {/* Close button */}
        <View style={[styles.closeRow, { borderBottomColor: border, paddingTop: Platform.OS === 'ios' ? 60 : 32 }]}>
          <Text style={[styles.panelTitle, { color: text }]}>SETTINGS</Text>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { borderColor: muted }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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

          {/* Developer version label: v{version}b{buildNumber}.{OTANumber} */}
          <Text style={[styles.versionText, { color: muted }]}>
            v{APP_VERSION}b{BUILD_NUMBER}.{OTA_NUMBER}
          </Text>
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
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PANEL_WIDTH,
    height: SCREEN_HEIGHT,
    zIndex: 400,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
  },
  closeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: {
    fontFamily: 'JosefinSans_700Bold',
    fontSize: 13,
    letterSpacing: 5,
  },
  closeBtn: {
    width:          36,
    height:         36,
    borderRadius:   18,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 3,
  },
  subRow: {
    paddingVertical: 15,
    paddingLeft: 40,
    paddingRight: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subLabel: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 14,
  },
  spacer: {
    flex: 1,
    minHeight: 48,
  },
  logoutBtn: {
    marginHorizontal: 24,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 50,
    borderWidth: 1,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 3,
  },
  versionText: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
    letterSpacing: 1,
  },
});
