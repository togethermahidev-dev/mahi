import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import type { NativeGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { useProfilePosts } from '@/hooks/useProfilePosts';
import { useAuthStore, useUserStore } from '@/store';
import { pointsStatsLabel } from '@/lib/mahiPoints';
import { pointsHint } from '@/lib/pointsHint';
import ThemeToggle from '@/components/ThemeToggle';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import PostViewer from '@/components/PostViewer';
import SettingsPanel from '@/components/SettingsPanel';
import { ProfileIcon, SearchIcon, SettingsIcon } from '@/components/ScreenIcons';
import AvatarPicker from '@/components/AvatarPicker';
import FollowListModal from '@/components/FollowListModal';
import SuggestedFollowsStrip from '@/components/SuggestedFollowsStrip';
import TouchCarousel from '@/components/TouchCarousel';
import ProfileIdentityCard from '@/components/ProfileIdentityCard';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  ELEVATION,
  FONT_SIZE,
  ICON_SIZE,
  LAYOUT,
  LINE_HEIGHT,
  RADIUS,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';
import { TAP_AREA, tapSlop } from '@/lib/tapArea';

// The settings and search icons are drawn 22 across; each taps as 44.
const ICON_SLOP = tapSlop(ICON_SIZE.i22, TAP_AREA.ios);

type ProfileShortcut = 'friends' | 'find';

const PROFILE_SHORTCUT_COPY: Record<
  ProfileShortcut,
  { title: string; subtitle: string; accessibilityHint: string }
> = {
  friends: {
    title: 'Friends',
    subtitle: 'See your list',
    accessibilityHint: 'Opens your friends list',
  },
  find: {
    title: 'Find friends',
    subtitle: 'Grow your circle',
    accessibilityHint: 'Searches Mahi by name or username',
  },
};

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
  /** Holds the surrounding page swipe while a horizontal profile carousel owns the touch. */
  onCarouselTouchChange?: (active: boolean) => void;
}

/** The rule behind Points and Best (#47), in the app's words. */
function explainPoints() {
  Alert.alert(
    'Mahi points',
    'You earn 1 point each time you post an answer to a tag. Miss a tag’s 48 hours and your points go back to 0. Your best always stays. If you’re ill or injured, rest comes first. Your best will be here when you’re back.'
  );
}

export default function ProfileScreen({
  isActive = true,
  listGesture,
  onSearch,
  onOpenCamera,
  onCarouselTouchChange,
}: ProfileScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const top = useSafeAreaInsets().top;
  const { width } = useWindowDimensions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [viewerPostId, setViewerPostId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted, border, accentText } = themeColors(dark);
  const toggleColor = dark ? COLORS.offWhite : COLORS.offBlack;
  const surface = dark ? COLORS.surfaceDark2 : COLORS.paper;
  const raisedSurface = dark ? COLORS.surfaceDark : COLORS.white;
  const iconSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);
  const heroEnd = dark ? COLORS.surfaceDark2 : COLORS.paper;

  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const userId = useAuthStore((s) => s.user?.id);

  // Drive a focus-aware re-sync of the posts grid. ProfileScreen is always
  // mounted (HorizontalNavigator index 0), so the grid's mount-only sync can't
  // recover a raced/empty first load — passing `isActive` lets useProfilePosts
  // re-sync when this panel becomes active and the store is empty/stale.
  // The grid (ProfileMediaMap) reads the same singleton store, so it re-renders.
  useProfilePosts(userId ?? '', isActive && !!userId);

  const hint = profile ? pointsHint(profile.streak_current, profile.streak_highest) : null;

  const displayName = profile?.display_name ?? profile?.first_name ?? profile?.username ?? '—';
  const currentPoints = profile?.streak_current ?? 0;
  const bestPoints = profile?.streak_highest ?? 0;
  const progress = profile
    ? bestPoints > 0
      ? Math.min(LAYOUT.percentFull, (currentPoints / bestPoints) * LAYOUT.percentFull)
      : currentPoints > 0
        ? LAYOUT.percentFull
        : 0
    : 0;
  const carouselItemWidth = Math.min(SIZE.z400, width - SPACE.s40 - SIZE.z48);
  const shortcuts: readonly ProfileShortcut[] = onSearch ? ['friends', 'find'] : ['friends'];

  // Everything above the grid. The page is one list, so this scrolls away and the grid can
  // fill the screen.
  const header = (
    <View style={styles.header}>
      {/* A compact, predictable top bar. Every icon has a visible 44-point target; Search stays
          here because it is the profile's route to finding anyone on Mahi. */}
      <View style={styles.topBar}>
        <View style={styles.titleBlock}>
          <Text style={[styles.screenTitle, { color: text }]}>Profile</Text>
        </View>
        <View style={styles.actions}>
          {onSearch ? (
            <Pressable
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: iconSurface, borderColor: border },
                pressed && { opacity: ALPHA.a70 },
              ]}
              onPress={onSearch}
              accessibilityRole="button"
              accessibilityLabel="Search people"
              accessibilityHint="Finds people by name or username"
              hitSlop={ICON_SLOP}
            >
              <SearchIcon size={ICON_SIZE.i22} color={toggleColor} />
            </Pressable>
          ) : null}
          <View style={[styles.iconButton, { backgroundColor: iconSurface, borderColor: border }]}>
            <ThemeToggle color={toggleColor} size={ICON_SIZE.i22} />
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: iconSurface, borderColor: border },
              pressed && { opacity: ALPHA.a70 },
            ]}
            onPress={() => setSettingsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={ICON_SLOP}
          >
            <SettingsIcon size={ICON_SIZE.i22} color={toggleColor} />
          </Pressable>
        </View>
      </View>

      {/* The identity card is deliberately calm and spacious: the photo is editable, the name is
          the strongest type, and the handle is clearly secondary. */}
      <ProfileIdentityCard
        dark={dark}
        displayName={displayName}
        username={profile?.username}
        supportingText="Your workout story, in one place."
        avatar={
          <AvatarPicker
            avatarUrl={profile?.avatar_url ?? null}
            isSelf={!!userId}
            userId={userId ?? ''}
            colors={{ bg: heroEnd, text, muted }}
            onUpdate={(newUrl) => profile && setProfile({ ...profile, avatar_url: newUrl })}
          />
        }
      />

      {/* The progress card explains itself on tap and never shows a fake zero while loading. */}
      <Pressable
        style={({ pressed }) => [
          styles.pointsCard,
          {
            backgroundColor: raisedSurface,
            borderColor: border,
            shadowColor: COLORS.black,
          },
          pressed && { opacity: ALPHA.a80 },
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
        <View style={styles.cardHeadingRow}>
          <View style={styles.cardHeadingCopy}>
            <Text style={[styles.cardEyebrow, { color: accentText }]}>Your progress</Text>
            <Text style={[styles.cardTitle, { color: text }]}>Mahi points</Text>
          </View>
          <Text style={[styles.learnMore, { color: accentText }]}>How it works ›</Text>
        </View>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: profile ? text : muted }]}>
              {profile ? currentPoints : '–'}
            </Text>
            <Text style={[styles.metricLabel, { color: muted }]}>Current</Text>
          </View>
          <View style={[styles.metricDivider, { backgroundColor: border }]} />
          <View style={styles.metric}>
            <Text style={[styles.metricValue, { color: profile ? text : muted }]}>
              {profile ? bestPoints : '–'}
            </Text>
            <Text style={[styles.metricLabel, { color: muted }]}>Personal best</Text>
          </View>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: iconSurface }]}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        {hint ? <Text style={[styles.pointsHint, { color: muted }]}>{hint}</Text> : null}
      </Pressable>

      {/* Two explicit routes avoid icon-only guesswork: Friends is always a list, never a made-up
          count, and finding new people remains one tap away. */}
      <TouchCarousel
        items={shortcuts}
        keyExtractor={(shortcut) => shortcut}
        itemWidth={carouselItemWidth}
        endInset={SIZE.z48}
        accessibilityLabel="Profile shortcuts"
        onTouchStateChange={onCarouselTouchChange}
        renderItem={(shortcut) => {
          const copy = PROFILE_SHORTCUT_COPY[shortcut];
          const isFriends = shortcut === 'friends';
          return (
            <Pressable
              style={({ pressed }) => [
                styles.quickAction,
                { backgroundColor: surface, borderColor: border },
                pressed && { opacity: ALPHA.a75 },
              ]}
              onPress={isFriends ? () => setFriendsOpen(true) : onSearch}
              accessibilityRole="button"
              accessibilityLabel={copy.title}
              accessibilityHint={copy.accessibilityHint}
            >
              <View style={[styles.quickIcon, { backgroundColor: iconSurface }]}>
                {isFriends ? (
                  <ProfileIcon size={ICON_SIZE.i20} color={toggleColor} />
                ) : (
                  <SearchIcon size={ICON_SIZE.i20} color={toggleColor} />
                )}
              </View>
              <View style={styles.quickCopy}>
                <Text style={[styles.quickTitle, { color: text }]}>{copy.title}</Text>
                <Text style={[styles.quickSubtitle, { color: muted }]}>{copy.subtitle}</Text>
              </View>
              <Text style={[styles.quickChevron, { color: muted }]}>›</Text>
            </Pressable>
          );
        }}
      />

      {/* Suggested follows — syncs on mount, renders null when empty */}
      <SuggestedFollowsStrip onPressUser={setProfileUserId} excludeUserId={userId} />

      <View style={styles.workoutsHeading}>
        <Text style={[styles.workoutsTitle, { color: text }]}>Your workouts</Text>
        <Text style={[styles.workoutsSubtitle, { color: muted }]}>
          Tap a post to see it full screen.
        </Text>
      </View>
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
          onCarouselTouchChange={onCarouselTouchChange}
        />
      ) : (
        header
      )}

      {/* Settings, in a page sheet */}
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
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.s20,
  },
  titleBlock: {
    flexShrink: 1,
  },
  screenTitle: {
    fontSize: FONT_SIZE.f28,
    lineHeight: LINE_HEIGHT.l28,
    fontFamily: FONTS.bold,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
  },
  iconButton: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACE.s12,
    paddingHorizontal: SPACE.s20,
    width: '100%',
  },
  pointsCard: {
    width: '100%',
    borderRadius: RADIUS.r24,
    borderWidth: BORDER_WIDTH.w1,
    marginTop: SPACE.s16,
    padding: SPACE.s20,
    elevation: ELEVATION.e3,
    shadowOpacity: ALPHA.a08,
    shadowRadius: SHADOW_BLUR.b8,
    shadowOffset: { width: 0, height: SIZE.z4 },
  },
  cardHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACE.s12,
  },
  cardHeadingCopy: {
    flexShrink: 1,
  },
  cardEyebrow: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACE.s4,
  },
  cardTitle: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l24,
  },
  learnMore: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    marginTop: SPACE.s4,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACE.s20,
    marginBottom: SPACE.s16,
  },
  metric: {
    flex: 1,
  },
  metricValue: {
    fontSize: FONT_SIZE.f38,
    lineHeight: LINE_HEIGHT.l38,
    fontFamily: FONTS.bold,
  },
  metricLabel: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
    marginTop: SPACE.s4,
  },
  metricDivider: {
    width: SIZE.z1,
    height: SIZE.z48,
    marginHorizontal: SPACE.s20,
  },
  progressTrack: {
    width: '100%',
    height: SIZE.z8,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  pointsHint: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l18,
    marginTop: SPACE.s12,
  },
  quickAction: {
    width: '100%',
    minHeight: SIZE.z88,
    borderRadius: RADIUS.r20,
    borderWidth: BORDER_WIDTH.w1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s12,
    paddingVertical: SPACE.s14,
    marginTop: SPACE.s12,
  },
  quickIcon: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACE.s10,
  },
  quickCopy: {
    flex: 1,
  },
  quickTitle: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
  },
  quickSubtitle: {
    fontSize: FONT_SIZE.f11,
    lineHeight: LINE_HEIGHT.l14,
    fontFamily: FONTS.regular,
    marginTop: SPACE.s3,
  },
  quickChevron: {
    fontSize: FONT_SIZE.f20,
    lineHeight: LINE_HEIGHT.l22,
    fontFamily: FONTS.regular,
    marginLeft: SPACE.s4,
  },
  workoutsHeading: {
    width: '100%',
    marginTop: SPACE.s28,
    marginBottom: SPACE.s14,
  },
  workoutsTitle: {
    fontSize: FONT_SIZE.f20,
    lineHeight: LINE_HEIGHT.l24,
    fontFamily: FONTS.bold,
  },
  workoutsSubtitle: {
    fontSize: FONT_SIZE.f13,
    lineHeight: LINE_HEIGHT.l18,
    fontFamily: FONTS.regular,
    marginTop: SPACE.s4,
  },
});
