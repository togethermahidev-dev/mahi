import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, Pressable } from 'react-native';
import type { NativeGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { useProfilePosts } from '@/hooks/useProfilePosts';
import { useAuthStore, useUserStore } from '@/store';
import { pointsStatsLabel } from '@/lib/mahiPoints';
import ThemeToggle from '@/components/ThemeToggle';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import PostViewer from '@/components/PostViewer';
import SettingsPanel from '@/components/SettingsPanel';
import { SearchIcon, SettingsIcon } from '@/components/ScreenIcons';
import AvatarPicker from '@/components/AvatarPicker';
import FollowListModal from '@/components/FollowListModal';
import SuggestedFollowsStrip from '@/components/SuggestedFollowsStrip';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  FONT_SIZE,
  ICON_SIZE,
  LINE_HEIGHT,
  OFFSET,
  SIZE,
  SPACE,
  TRACKING,
  withAlpha,
} from '@/constants/tokens';

interface ProfileScreenProps {
  // True when this panel is the active panel in HorizontalNavigator (index 0).
  // Drives a focus re-sync of the posts grid to recover a raced/empty first load.
  isActive?: boolean;
  /** The page list's scrolling as a gesture, so the sideways page swipe can run alongside it. */
  listGesture?: NativeGesture;
  /** Open people search (the magnifier, top right; founder, 2026-10-05). */
  onSearch?: () => void;
  /** Go to the Camera page (the empty grid's "Open camera"); without it the grid only explains. */
  onOpenCamera?: () => void;
}

/** The rule behind Points and Best (#47), in the app's words. */
function explainPoints() {
  Alert.alert(
    'Mahi points',
    'You earn 1 point each time you post an answer to a tag. Miss a tag’s 48 hours and your points go back to 0. Your best always stays.'
  );
}

export default function ProfileScreen({
  isActive = true,
  listGesture,
  onSearch,
  onOpenCamera,
}: ProfileScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const top = useSafeAreaInsets().top;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [viewerPostId, setViewerPostId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted } = themeColors(dark);
  const toggleColor = dark ? COLORS.offWhite : COLORS.offBlack;

  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const userId = useAuthStore((s) => s.user?.id);

  // Drive a focus-aware re-sync of the posts grid. ProfileScreen is always
  // mounted (HorizontalNavigator index 0), so the grid's mount-only sync can't
  // recover a raced/empty first load — passing `isActive` lets useProfilePosts
  // re-sync when this panel becomes active and the store is empty/stale.
  // The grid (ProfileMediaMap) reads the same singleton store, so it re-renders.
  useProfilePosts(userId ?? '', isActive && !!userId);

  const displayName = profile?.display_name ?? profile?.first_name ?? profile?.username ?? '—';

  // Everything above the grid. The page is one list, so this scrolls away and the grid can
  // fill the screen.
  const header = (
    <View style={styles.header}>
      {/* Settings icon — top-left */}
      <View style={styles.headerLeft}>
        <Pressable
          style={({ pressed }) => pressed && { opacity: ALPHA.a20 }}
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <SettingsIcon size={ICON_SIZE.i22} color={toggleColor} />
        </Pressable>
      </View>

      {/* Search, then the theme toggle — top-right. Search finds anyone on Mahi by name or
          username (the Camera's pull-down went with up/down swiping). */}
      <View style={styles.headerRight}>
        {onSearch ? (
          <Pressable
            style={({ pressed }) => pressed && { opacity: ALPHA.a20 }}
            onPress={onSearch}
            accessibilityRole="button"
            accessibilityLabel="Search people"
            hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
          >
            <SearchIcon size={ICON_SIZE.i22} color={toggleColor} />
          </Pressable>
        ) : null}
        <ThemeToggle color={toggleColor} size={ICON_SIZE.i22} />
      </View>

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

      {/* Friends — a list, never a number */}
      <Pressable
        style={({ pressed }) => [styles.statsRow, pressed && { opacity: ALPHA.a70 }]}
        onPress={() => setFriendsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Friends"
      >
        <Text style={[styles.statLabel, { color: muted }]}>Friends ›</Text>
      </Pressable>

      {/* Mahi points: one per post that answers a tag, back to 0 on a missed tag; Best stays.
          A dash until the profile has loaded, so a real number never swaps in over a 0.
          Tap for the rule. */}
      <Pressable
        style={({ pressed }) => [
          styles.statsRow,
          { marginTop: SPACE.s16 },
          pressed && { opacity: ALPHA.a70 },
        ]}
        onPress={explainPoints}
        accessibilityRole="button"
        accessibilityLabel={
          profile
            ? pointsStatsLabel(profile.streak_current, profile.streak_highest)
            : 'Mahi points loading'
        }
        accessibilityHint="Explains Mahi points"
      >
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: profile ? text : muted }]}>
            {profile ? (profile.streak_current ?? 0) : '–'}
          </Text>
          <Text style={[styles.statLabel, { color: muted }]}>Points</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: muted }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: profile ? text : muted }]}>
            {profile ? (profile.streak_highest ?? 0) : '–'}
          </Text>
          <Text style={[styles.statLabel, { color: muted }]}>Best</Text>
        </View>
      </Pressable>
      {/* A newcomer's 0 · 0 says how to earn the first point. */}
      {profile && !profile.streak_current && !profile.streak_highest ? (
        <Text style={[styles.pointsHint, { color: muted }]}>
          Answer your first tag to earn your first point.
        </Text>
      ) : null}

      {/* Suggested follows — syncs on mount, renders null when empty */}
      <SuggestedFollowsStrip onPressUser={setProfileUserId} excludeUserId={userId} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: top }]}>
      {/* The header and the personal photo grid, scrolling as one page */}
      {profile && userId ? (
        <ProfileMediaMap
          userId={profile.id}
          isSelf={userId === profile.id}
          header={header}
          onPostPress={(post) => setViewerPostId(post.id)}
          listGesture={listGesture}
          onOpenCamera={onOpenCamera}
        />
      ) : (
        header
      )}

      {/* Settings panel — slides in from left */}
      <SettingsPanel visible={settingsOpen} onClose={() => setSettingsOpen(false)} dark={dark} />

      {/* Friends list */}
      <FollowListModal
        visible={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        userId={userId ?? ''}
        type="friends"
        dark={dark}
      />

      {/* Your posts, full screen from the tapped one: up/down browses, sideways closes */}
      {profile ? (
        <PostViewer
          userId={profile.id}
          postId={viewerPostId}
          onClose={() => setViewerPostId(null)}
          onOpenProfile={(id) => {
            setViewerPostId(null);
            setProfileUserId(id);
          }}
        />
      ) : null}

      {/* Suggested user's profile — opened from a suggestion card */}
      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Settings and the theme toggle sit in the header's top corners and scroll away with it.
  headerLeft: {
    position: 'absolute',
    top: 0,
    left: OFFSET.o24,
  },
  headerRight: {
    position: 'absolute',
    top: 0,
    right: OFFSET.o24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s20,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: SPACE.s32,
    paddingBottom: SPACE.s16,
    width: '100%',
  },
  displayName: {
    fontSize: FONT_SIZE.f22,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t4,
    marginBottom: SPACE.s6,
    textAlign: 'center',
  },
  handle: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    marginBottom: SPACE.s16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s32,
  },
  stat: {
    alignItems: 'center',
    gap: SPACE.s4,
  },
  statValue: {
    fontSize: FONT_SIZE.f28,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l28,
  },
  statLabel: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
  pointsHint: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginTop: SPACE.s8,
  },
  statDivider: {
    width: SIZE.z1,
    height: SIZE.z40,
    opacity: ALPHA.a30,
  },
});
