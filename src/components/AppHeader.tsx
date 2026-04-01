import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/hooks/useAppTheme';
import { ProfileIcon, MessagesIcon } from '@/components/ScreenIcons';

interface AppHeaderProps {
  // true on Camera screen (always dark bg) → white text/icons
  // false on other screens → follows theme
  isDark: boolean;
  onProfilePress: () => void;
  onMessagesPress: () => void;
}

export default function AppHeader({
  isDark,
  onProfilePress,
  onMessagesPress,
}: AppHeaderProps): React.JSX.Element {
  const { dark: systemDark } = useAppTheme();
  // isDark = camera screen (always dark bg); systemDark = OS-level dark mode
  const onDark   = isDark || systemDark;
  const mahiColor = onDark ? '#FFFFFF' : '#1A1A17';
  const pillBg    = isDark ? '#FFFFFF' : (systemDark ? '#E8E8E3' : '#1A1A17');
  const pillIcon  = isDark ? '#1A1A17' : (systemDark ? '#1A1A17' : '#FFFFFF');

  // Gradient: dark screens (camera/dark mode) → dark-to-clear; light mode → white-to-clear
  const gradientColors: [string, string] = onDark
    ? ['rgba(17,17,17,0.88)', 'rgba(17,17,17,0)']
    : ['rgba(255,255,255,0.92)', 'rgba(255,255,255,0)'];

  return (
    // pointerEvents="box-none" lets touches pass through the transparent header
    // area to the screen beneath (camera feed, etc.) while still receiving
    // touches on the profile pill and messages icon.
    <View style={styles.root} pointerEvents="box-none">
      <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.inner}>
        {/* Profile pill — navigates to Profile screen (horizontal left) */}
        <TouchableOpacity
          style={[styles.profilePill, { backgroundColor: pillBg }]}
          onPress={onProfilePress}
          activeOpacity={0.75}
        >
          <ProfileIcon size={16} color={pillIcon} />
        </TouchableOpacity>

        {/* MAHI branding — centered, with offset colour echo behind */}
        <View style={styles.titleWrapper}>
          {/* Back layer: accent colour, offset slightly */}
          <Text style={[styles.title, styles.titleEcho]}>MAHI</Text>
          {/* Front layer: main colour */}
          <Text style={[styles.title, { color: mahiColor }]}>MAHI</Text>
        </View>

        {/* Messages pill — navigates to Messages screen (horizontal right) */}
        <TouchableOpacity
          style={styles.messagesPill}
          onPress={onMessagesPress}
          activeOpacity={0.75}
        >
          <MessagesIcon size={16} color={pillIcon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePill: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 24,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 8,
  },
  titleEcho: {
    // accent colour echo — adjust top/left to taste
    position: 'absolute',
    color: '#59c2d7',
    top: 3,
    left: 3,
  },
  messagesPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#59c2d7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
  },
});
