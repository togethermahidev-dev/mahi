import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import ThemeToggle from '@/components/ThemeToggle';

export default function ProfileScreen(): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg   = dark ? '#1C1C19' : '#FFFFFF';
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const toggleColor = dark ? '#E8E8E3' : '#1A1A17';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Theme toggle — top-right, acts as settings control */}
      <View style={styles.headerRight}>
        <ThemeToggle color={toggleColor} size={22} />
      </View>

      <Text style={[styles.label, { color: text }]}>PROFILE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 32,
    right: 24,
  },
  label: {
    fontSize: 24,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 8,
  },
});
