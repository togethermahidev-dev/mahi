import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore, useUserStore } from '@/store';
import ThemeToggle from '@/components/ThemeToggle';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import SettingsPanel from '@/components/SettingsPanel';
import { SettingsIcon, CalendarIcon } from '@/components/ScreenIcons';
import AvatarPicker from '@/components/AvatarPicker';
import TrainingDaysScreen from '@/components/TrainingDaysScreen';

export default function ProfileScreen(): React.JSX.Element {
  const { dark } = useAppTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trainingDaysOpen, setTrainingDaysOpen] = useState(false);
  const bg      = dark ? '#1C1C19' : '#FFFFFF';
  const text    = dark ? '#E8E8E3' : '#1A1A17';
  const muted   = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const toggleColor = dark ? '#E8E8E3' : '#1A1A17';

  const profile    = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const userId     = useAuthStore((s) => s.user?.id);

  const displayName = profile?.display_name ?? profile?.first_name ?? profile?.username ?? '—';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Settings icon — top-left */}
      <View style={styles.headerLeft}>
        <TouchableOpacity
          onPress={() => setSettingsOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <SettingsIcon size={22} color={toggleColor} />
        </TouchableOpacity>
      </View>

      {/* Theme toggle — top-right */}
      <View style={styles.headerRight}>
        <ThemeToggle color={toggleColor} size={22} />
      </View>

      {/* Profile header — avatar, name, stats */}
      <View style={styles.header}>
        {/* Avatar — always rendered; edit button shown as soon as userId is known
            (ProfileScreen is always the signed-in user's own profile) */}
        <AvatarPicker
          avatarUrl={profile?.avatar_url ?? null}
          isSelf={!!userId}
          userId={userId ?? ''}
          colors={{ bg, text, muted }}
          onUpdate={(newUrl) => profile && setProfile({ ...profile, avatar_url: newUrl })}
        />

        {/* Name + handle */}
        <Text style={[styles.displayName, { color: text }]}>{displayName}</Text>
        {profile?.username ? (
          <Text style={[styles.handle, { color: muted }]}>@{profile.username}</Text>
        ) : null}

        {/* Training days editor trigger */}
        <TouchableOpacity
          onPress={() => setTrainingDaysOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.trainingDaysBtn}
        >
          <CalendarIcon size={18} color={muted} />
          <Text style={[styles.trainingDaysLabel, { color: muted }]}>Training Days</Text>
        </TouchableOpacity>

        {/* Streak stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: text }]}>
              {profile?.streak_current ?? 0}
            </Text>
            <Text style={[styles.statLabel, { color: muted }]}>STREAK</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: muted }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: text }]}>
              {profile?.streak_highest ?? 0}
            </Text>
            <Text style={[styles.statLabel, { color: muted }]}>BEST</Text>
          </View>
        </View>
      </View>

      {/* Personal streak photo grid */}
      {profile && userId ? (
        <View style={[styles.mapShadow, { shadowColor: dark ? '#000' : '#1A1A17' }]}>
          <ProfileMediaMap userId={profile.id} isSelf={userId === profile.id} />
        </View>
      ) : null}

      {/* Settings panel — slides in from left */}
      <SettingsPanel
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        dark={dark}
      />

      {/* Training days editor — slides in from left */}
      <TrainingDaysScreen
        visible={trainingDaysOpen}
        onClose={() => setTrainingDaysOpen(false)}
        dark={dark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
  },
  headerLeft: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 32,
    left: 24,
  },
  headerRight: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 32,
    right: 24,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  displayName: {
    fontSize: 22,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 4,
    marginBottom: 6,
    textAlign: 'center',
  },
  handle: {
    fontSize: 14,
    fontFamily: 'JosefinSans_400Regular_Italic',
    marginBottom: 16,
  },
  trainingDaysBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  trainingDaysLabel: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'JosefinSans_700Bold',
    lineHeight: 28,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 3,
  },
  statDivider: {
    width: 1,
    height: 40,
    opacity: 0.3,
  },
  mapShadow: {
    flex: 1,
    width: '100%',
    marginTop: 96,
  },
});
