import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { ProfileIcon, MessagesIcon, NotificationsIcon } from '@/components/ScreenIcons';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS } from '@/constants/tokens';

interface AppHeaderProps {
  // true on Camera screen (always dark bg) → white text/icons
  // false on other screens → follows theme
  isDark: boolean;
  onProfilePress: () => void;
  onMessagesPress: () => void;
  unreadNotifications: number;
  onNotificationsPress: () => void;
  /** Profile and Messages pills; hidden when the glass rail carries them. */
  showNavPills?: boolean;
}

export default function AppHeader({
  isDark,
  onProfilePress,
  onMessagesPress,
  unreadNotifications,
  onNotificationsPress,
  showNavPills = true,
}: AppHeaderProps): React.JSX.Element {
  const { dark: systemDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  // Reference pattern: gate a feature in one line with useFeatureFlag. The
  // 'notifications-core' flag is at 100% (default-on), so the bell shows
  // normally; flip it off in PostHog to hide the entry point.
  const showNotifications = useFeatureFlag('notifications-core');
  // isDark = camera screen (always dark bg); systemDark = OS-level dark mode
  const onDark = isDark || systemDark;
  const mahiColor = onDark ? COLORS.white : COLORS.offBlack;
  const pillBg = isDark ? COLORS.white : systemDark ? COLORS.offWhite : COLORS.offBlack;
  const pillIcon = isDark ? COLORS.offBlack : systemDark ? COLORS.offBlack : COLORS.white;

  // Gradient: dark screens (camera/dark mode) → dark-to-clear; light mode → white-to-clear
  const gradientColors: [string, string] = onDark
    ? [withAlpha(COLORS.ink, 0.88), withAlpha(COLORS.ink, 0)]
    : [withAlpha(COLORS.white, 0.92), withAlpha(COLORS.white, 0)];

  return (
    // pointerEvents="box-none" lets touches pass through the transparent header
    // area to the screen beneath (camera feed, etc.) while still receiving
    // touches on the profile pill and messages icon.
    <View style={[styles.root, { paddingTop: insets.top }]} pointerEvents="box-none">
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.inner}>
        {/* Profile pill — navigates to Profile screen (horizontal left) */}
        {showNavPills && (
          <TouchableOpacity
            style={[styles.profilePill, { backgroundColor: pillBg }]}
            onPress={onProfilePress}
            activeOpacity={0.75}
          >
            <ProfileIcon size={16} color={pillIcon} />
          </TouchableOpacity>
        )}

        {/* MAHI branding — centered, with offset colour echo behind */}
        <View style={styles.titleWrapper}>
          {/* Back layer: accent colour, offset slightly */}
          <Text style={[styles.title, styles.titleEcho]}>MAHI</Text>
          {/* Front layer: main colour */}
          <Text style={[styles.title, { color: mahiColor }]}>MAHI</Text>
        </View>

        {/* Notifications bell pill — opens NotificationsScreen overlay.
            Gated by the 'notifications-core' flag (absolutely positioned, so
            hiding it leaves the other pills undisturbed). */}
        {showNotifications && (
          <TouchableOpacity
            style={[styles.bellPill, { backgroundColor: pillBg }, !showNavPills && { right: 0 }]}
            onPress={onNotificationsPress}
            activeOpacity={0.75}
          >
            <NotificationsIcon size={16} color={pillIcon} />
            {unreadNotifications > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>
        )}

        {/* Messages pill — navigates to Messages screen (horizontal right) */}
        {showNavPills && (
          <TouchableOpacity
            style={styles.messagesPill}
            onPress={onMessagesPress}
            activeOpacity={0.75}
          >
            <MessagesIcon size={16} color={pillIcon} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: SPACE.s24,
    paddingBottom: SPACE.s12,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePill: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.r18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    left: 0,
  },
  titleWrapper: {
    // sized to the text so the absolute echo doesn't affect layout
    position: 'relative',
  },
  title: {
    fontSize: FONT_SIZE.f24,
    fontFamily: FONTS.bold,
    letterSpacing: 8,
  },
  titleEcho: {
    // accent colour echo — adjust top/left to taste
    position: 'absolute',
    color: COLORS.accent,
    top: 3,
    left: 3,
  },
  messagesPill: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.r18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
  },
  bellPill: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.r18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 44,
  },
  bellDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: RADIUS.r4,
    backgroundColor: COLORS.accent,
  },
});
