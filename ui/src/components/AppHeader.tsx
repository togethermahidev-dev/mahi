import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCoachAnchor } from '@/hooks/useCoachMarks';
import { useTagStore } from '@/store';
import { ProfileIcon, MessagesIcon, NotificationsIcon } from '@/components/ScreenIcons';
import {
  COLORS,
  ALPHA,
  ICON_SIZE,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';
import { LETTERING } from '@/constants/typography';
import { TAP_AREA, tapSlop } from '@/lib/tapArea';

// The pills are drawn 36 across; each taps as 44. The bell and Messages sit 8 apart, so 4 of
// slop on each meets exactly in the middle and never overlaps.
const PILL_SLOP = tapSlop(SIZE.z36, TAP_AREA.ios);

interface AppHeaderProps {
  // true on Camera screen (always dark bg) → white text/icons
  // false on other screens → follows theme
  isDark: boolean;
  /** The bell's one-time tip shows on this header (the feed's); by default wherever it isn't dark. */
  bellTipHere?: boolean;
  onProfilePress: () => void;
  onMessagesPress: () => void;
  unreadNotifications: number;
  onNotificationsPress: () => void;
  /** Profile and Messages pills; hidden when the glass rail carries them. */
  showNavPills?: boolean;
}

export default function AppHeader({
  isDark,
  bellTipHere = !isDark,
  onProfilePress,
  onMessagesPress,
  unreadNotifications,
  onNotificationsPress,
  showNavPills = true,
}: AppHeaderProps): React.JSX.Element {
  const { dark: systemDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  // The first time a mate's tag is waiting, a one-time tip points at the bell on the Feed (the
  // Camera already says who tagged you).
  const tagged = useTagStore((s) => s.openTags.length > 0);
  const bellTip = useCoachAnchor('bell', bellTipHere && tagged);
  // isDark = camera screen (always dark bg); systemDark = OS-level dark mode
  const onDark = isDark || systemDark;
  const mahiColor = onDark ? COLORS.white : COLORS.offBlack;
  const pillBg = isDark ? COLORS.white : systemDark ? COLORS.offWhite : COLORS.offBlack;
  const pillIcon = isDark ? COLORS.offBlack : systemDark ? COLORS.offBlack : COLORS.white;

  // Gradient: dark screens (camera/dark mode) → dark-to-clear; light mode → white-to-clear
  const gradientColors: [string, string] = onDark
    ? [withAlpha(COLORS.ink, ALPHA.a88), withAlpha(COLORS.ink, 0)]
    : [withAlpha(COLORS.white, ALPHA.a92), withAlpha(COLORS.white, 0)];

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
          <Pressable
            style={({ pressed }) => [
              styles.profilePill,
              { backgroundColor: pillBg },
              pressed && styles.pressed,
            ]}
            onPress={onProfilePress}
            hitSlop={PILL_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <ProfileIcon size={ICON_SIZE.i16} color={pillIcon} />
          </Pressable>
        )}

        {/* MAHI branding — centered, with offset colour echo behind */}
        <View
          style={styles.titleWrapper}
          accessible
          accessibilityRole="header"
          accessibilityLabel="Mahi"
        >
          {/* Back layer: accent colour, offset slightly */}
          <Text style={[styles.title, styles.titleEcho]}>MAHI</Text>
          {/* Front layer: main colour */}
          <Text style={[styles.title, { color: mahiColor }]}>MAHI</Text>
        </View>

        {/* Notifications bell pill — opens NotificationsScreen overlay (absolutely positioned,
            so it leaves the other pills undisturbed). */}
        <Pressable
          ref={bellTip}
          style={({ pressed }) => [
            styles.bellPill,
            { backgroundColor: pillBg },
            !showNavPills && { right: 0 },
            pressed && styles.pressed,
          ]}
          onPress={onNotificationsPress}
          hitSlop={PILL_SLOP}
          accessibilityRole="button"
          accessibilityLabel={
            unreadNotifications > 0
              ? `Notifications, ${unreadNotifications} unread`
              : 'Notifications'
          }
        >
          <NotificationsIcon size={ICON_SIZE.i16} color={pillIcon} />
          {unreadNotifications > 0 && <View style={styles.bellDot} />}
        </Pressable>

        {/* Messages pill — navigates to Messages screen (horizontal right) */}
        {showNavPills && (
          <Pressable
            style={({ pressed }) => [styles.messagesPill, pressed && styles.pressed]}
            onPress={onMessagesPress}
            hitSlop={PILL_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Messages"
          >
            <MessagesIcon size={ICON_SIZE.i16} color={COLORS.offBlack} />
          </Pressable>
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
  pressed: {
    opacity: ALPHA.a75,
  },
  profilePill: {
    width: SIZE.z36,
    height: SIZE.z36,
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
    ...LETTERING.wordmarkHeader,
  },
  titleEcho: {
    // accent colour echo — adjust top/left to taste
    position: 'absolute',
    color: COLORS.accent,
    top: OFFSET.o3,
    left: OFFSET.o3,
  },
  messagesPill: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
  },
  bellPill: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: OFFSET.o44,
  },
  bellDot: {
    position: 'absolute',
    top: OFFSET.o4,
    right: OFFSET.o4,
    width: SIZE.z8,
    height: SIZE.z8,
    borderRadius: RADIUS.r4,
    backgroundColor: COLORS.accent,
  },
});
