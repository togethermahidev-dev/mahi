import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
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
  const fg        = isDark ? '#FFFFFF' : '#1A1A17';         // foreground: text + icons
  const pillBg    = isDark ? '#FFFFFF' : '#1A1A17';         // filled pill background
  const pillIcon  = isDark ? '#1A1A17' : '#FFFFFF';         // icon inside filled pill

  return (
    // pointerEvents="box-none" lets touches pass through the transparent header
    // area to the screen beneath (camera feed, etc.) while still receiving
    // touches on the profile pill and messages icon.
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.inner}>
        {/* Profile pill — navigates to Profile screen (horizontal left) */}
        <TouchableOpacity
          style={[styles.profilePill, { backgroundColor: pillBg }]}
          onPress={onProfilePress}
          activeOpacity={0.75}
        >
          <ProfileIcon size={16} color={pillIcon} />
        </TouchableOpacity>

        {/* MAHI branding — centered */}
        <Text style={[styles.title, { color: fg }]}>MAHI</Text>

        {/* Messages icon — navigates to Messages screen (horizontal right) */}
        <TouchableOpacity
          style={styles.messagesButton}
          onPress={onMessagesPress}
          activeOpacity={0.75}
        >
          <MessagesIcon size={22} color={fg} />
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
  title: {
    fontSize: 24,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 8,
  },
  messagesButton: {
    position: 'absolute',
    right: 0,
    padding: 4,
  },
});
