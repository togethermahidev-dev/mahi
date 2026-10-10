import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  StyleSheet,
  Pressable,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import type { NativeGesture } from 'react-native-gesture-handler';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { useProfilePosts } from '@/hooks/useProfilePosts';
import { useAuthStore, useProfilePostsStore, useUserStore } from '@/store';
import {
  answeredMatesLine,
  lastAnsweredMates,
  mahiPointsWords,
  pointsStatsLabel,
  pointsValue,
} from '@/lib/mahiPoints';
import RollingNumber from '@/components/RollingNumber';
import PointsBar from '@/components/PointsBar';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { POINTS_RULE, pointsHint } from '@/lib/pointsHint';
import { INVITE_A_FRIEND } from '@/lib/shareSheet';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import PostViewer from '@/components/PostViewer';
import SettingsPanel from '@/components/SettingsPanel';
import { SearchIcon, SettingsIcon } from '@/components/ScreenIcons';
import AvatarPicker from '@/components/AvatarPicker';
import FollowListModal from '@/components/FollowListModal';
import MyInvitesSheet from '@/components/MyInvitesSheet';
import { useInviteAMate } from '@/components/ShareSheet';
import SuggestedFollowsStrip from '@/components/SuggestedFollowsStrip';
import ProfileIdentityCard from '@/components/ProfileIdentityCard';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  ICON_SIZE,
  LAYOUT,
  LINE_HEIGHT,
  POINTS_NUMBER,
  PROFILE,
  RADIUS,
  SIZE,
  SPACE,
  STROKE,
  withAlpha,
} from '@/constants/tokens';
import { TAP_AREA, tapSlop } from '@/lib/tapArea';
import type { MorphSource } from '@/lib/morph';

// The settings and search icons are drawn 22 across; each taps as 44.
const ICON_SLOP = tapSlop(ICON_SIZE.i22, TAP_AREA.ios);
// The short links under your name are 32 tall; each taps as 44 (they are wide enough already).
const LINK_SLOP = {
  top: tapSlop(SIZE.z32, TAP_AREA.ios).top,
  bottom: tapSlop(SIZE.z32, TAP_AREA.ios).bottom,
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
  /**
   * The profile has no sideways carousel any more (the compact header, owner 2026-10-10), so
   * nothing here holds the page swipe. Still accepted so the navigator's call keeps working.
   */
  onCarouselTouchChange?: (active: boolean) => void;
}

/** The rule behind Points and Best (#47), in the app's words. */
function explainPoints() {
  Alert.alert(
    'Mahi points',
    `${POINTS_RULE} If you’re ill or injured, rest comes first. Your best will be here when you’re back.`
  );
}

/** A person with a plus beside them: "Invite a friend". Drawn like the app's other icons. */
function InviteIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinecap="round"
      />
      <Circle cx="8.5" cy="7" r="4" stroke={color} strokeWidth={STROKE.s1_8} />
      <Path d="M20 8v6M23 11h-6" stroke={color} strokeWidth={STROKE.s1_8} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * A points number on the profile: rolling (switch `profile-points-card`) or still, a dash until
 * it has loaded. Either way it keeps its own width in the row and grows only up to large text, so
 * the words beside it always have room (they wrap or shrink; the number never gives way).
 */
function PointsNumber({
  value,
  rolling,
  style,
  size,
  color,
}: {
  value: number | null;
  rolling: boolean;
  style: StyleProp<TextStyle>;
  size: number;
  color: string;
}) {
  if (!rolling) {
    return (
      <Text style={style} numberOfLines={1} maxFontSizeMultiplier={LAYOUT.largeTextScale}>
        {pointsValue(value)}
      </Text>
    );
  }
  return (
    <RollingNumber
      value={value}
      style={style}
      font={{ family: FONTS.bold, size, color }}
      maxFontSizeMultiplier={LAYOUT.largeTextScale}
    />
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
  const [invitesOpen, setInvitesOpen] = useState(false);
  // "Invite a friend" (core workflow step 24): one link at a time, so a double tap can't make two.
  const [inviting, setInviting] = useState(false);
  // The link opens in Mahi's share sheet (switch `share-sheet`; off: the phone's).
  const { invite: inviteAMate, sheet: inviteSheet } = useInviteAMate();
  const [viewerPost, setViewerPost] = useState<{
    postId: string;
    source?: MorphSource;
  } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted, border } = themeColors(dark);
  const toggleColor = dark ? COLORS.offWhite : COLORS.offBlack;
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
  const { posts: myPosts } = useProfilePosts(userId ?? '', isActive && !!userId);
  // The last three mates you answered: only once your posts have been read (never a guess).
  const myPostsRead = useProfilePostsStore((s) => s.userId === userId && s.lastSyncedAt !== null);
  // Kill switch: off, plain numbers, a still bar and no line about your last answers.
  const cardOn = useFeatureFlag('profile-points-card');
  const answeredMates = cardOn && myPostsRead ? lastAnsweredMates(myPosts) : [];
  const matesLine = answeredMatesLine(answeredMates);

  const hint = profile ? pointsHint(profile.streak_current, profile.streak_highest) : null;
  // One short line under the bar: where you stand, then who you last answered.
  const pointsNote = [hint, matesLine].filter(Boolean).join(' ');

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

  // Everything above the grid, kept short so the first rows of posts show without scrolling
  // (owner, 2026-10-10). The page is one list, so this scrolls away with the grid.
  const header = (
    <View style={styles.header}>
      {/* Top bar: Invite a friend in the top left; Search and Settings stay in the top right.
          Every button has a visible 44-point target. */}
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [
            styles.inviteButton,
            { backgroundColor: text },
            (pressed || inviting) && { opacity: ALPHA.a70 },
          ]}
          onPress={() => {
            if (inviting) return;
            setInviting(true);
            void inviteAMate().finally(() => setInviting(false));
          }}
          disabled={inviting}
          accessibilityRole="button"
          accessibilityLabel={INVITE_A_FRIEND.label}
          accessibilityHint={INVITE_A_FRIEND.hint}
          accessibilityState={{ busy: inviting, disabled: inviting }}
        >
          {inviting ? (
            <ActivityIndicator color={bg} />
          ) : (
            <InviteIcon size={ICON_SIZE.i22} color={bg} />
          )}
        </Pressable>
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

      {/* Who you are: name and @username on the left, your picture on the right (tap to see it,
          Edit to change it), and the two short ways to your people under your name. */}
      <ProfileIdentityCard
        dark={dark}
        displayName={displayName}
        username={profile?.username}
        avatar={
          <AvatarPicker
            avatarUrl={profile?.avatar_url ?? null}
            isSelf={!!userId}
            userId={userId ?? ''}
            colors={{ bg: heroEnd, text, muted }}
            onUpdate={(newUrl) => profile && setProfile({ ...profile, avatar_url: newUrl })}
          />
        }
      >
        <View style={styles.links}>
          <Pressable
            style={({ pressed }) => [
              styles.link,
              { borderColor: border },
              pressed && { opacity: ALPHA.a70 },
            ]}
            onPress={() => setFriendsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Friends"
            accessibilityHint="Opens your friends list"
            hitSlop={LINK_SLOP}
          >
            <Text style={[styles.linkText, { color: text }]} numberOfLines={1}>
              Friends
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.link,
              { borderColor: border },
              pressed && { opacity: ALPHA.a70 },
            ]}
            onPress={() => setInvitesOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Your invites"
            accessibilityHint="Shows the links you’ve sent and who joined"
            hitSlop={LINK_SLOP}
          >
            <Text style={[styles.linkText, { color: text }]} numberOfLines={1}>
              Your invites
            </Text>
          </Pressable>
        </View>
      </ProfileIdentityCard>

      {/* Mahi points on one line: the number keeps its own width, the words take what is left
          and wrap or shrink, and Best sits at the far end. It explains itself on tap and never
          shows a fake zero while loading. */}
      <Pressable
        style={({ pressed }) => [
          styles.pointsCard,
          { backgroundColor: raisedSurface, borderColor: border },
          pressed && { opacity: ALPHA.a80 },
        ]}
        onPress={explainPoints}
        accessibilityRole="button"
        // The card's label replaces what's inside it, so it carries the hint and mates lines too.
        accessibilityLabel={
          profile
            ? [pointsStatsLabel(profile.streak_current, profile.streak_highest), hint, matesLine]
                .filter(Boolean)
                .join(' ')
            : 'Mahi points loading'
        }
        accessibilityHint="Explains Mahi points"
      >
        <View style={styles.pointsRow}>
          <PointsNumber
            value={profile ? currentPoints : null}
            rolling={cardOn}
            style={[styles.pointsNumber, { color: profile ? text : muted }]}
            size={FONT_SIZE.f24}
            color={text}
          />
          <Text
            style={[styles.pointsWords, { color: text }]}
            numberOfLines={POINTS_NUMBER.wordsLines}
            adjustsFontSizeToFit
            minimumFontScale={POINTS_NUMBER.wordsMinScale}
          >
            {mahiPointsWords(profile ? currentPoints : null)}
          </Text>
          <View style={styles.bestGroup}>
            <Text
              style={[styles.bestLabel, { color: muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={LAYOUT.largeTextScale}
            >
              Best
            </Text>
            <PointsNumber
              value={profile ? bestPoints : null}
              rolling={cardOn}
              style={[styles.bestNumber, { color: profile ? text : muted }]}
              size={FONT_SIZE.f17}
              color={text}
            />
          </View>
          <Text style={[styles.chevron, { color: muted }]}>›</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: iconSurface }]}>
          {cardOn ? (
            <PointsBar progress={progress} replay={isActive && !!profile} />
          ) : (
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          )}
        </View>
        {pointsNote ? (
          <Text style={[styles.pointsNote, { color: muted }]} numberOfLines={PROFILE.noteLines}>
            {pointsNote}
          </Text>
        ) : null}
      </Pressable>

      {/* Suggested follows — syncs on mount, folded to one line, renders null when empty */}
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
          onPostPress={(post, source) => setViewerPost({ postId: post.id, source })}
          listGesture={listGesture}
          onOpenCamera={onOpenCamera}
        />
      ) : (
        header
      )}

      {/* Settings, in a page sheet */}
      <SettingsPanel visible={settingsOpen} onClose={() => setSettingsOpen(false)} dark={dark} />

      {/* Friends list, in a page sheet */}
      <FollowListModal
        visible={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        userId={userId ?? ''}
        type="friends"
        dark={dark}
      />

      {/* The links you've sent and who joined */}
      <MyInvitesSheet visible={invitesOpen} onClose={() => setInvitesOpen(false)} dark={dark} />
      {inviteSheet}

      {/* Your posts, full screen from the tapped one: up/down browses, sideways closes */}
      {profile ? (
        <PostViewer
          userId={profile.id}
          postId={viewerPost?.postId ?? null}
          source={viewerPost?.source}
          onClose={() => setViewerPost(null)}
          onOpenProfile={(id) => {
            setViewerPost(null);
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
  header: {
    paddingTop: SPACE.s4,
    paddingHorizontal: SPACE.s20,
    paddingBottom: SPACE.s12,
    width: '100%',
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.s8,
  },
  // A solid circle in the theme's ink: black on white, white on black.
  inviteButton: {
    width: PROFILE.inviteButton,
    height: PROFILE.inviteButton,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
  // The short links wrap onto a second line at large text instead of running under the picture.
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.s8,
    marginTop: SPACE.s10,
  },
  link: {
    minHeight: SIZE.z32,
    justifyContent: 'center',
    paddingHorizontal: SPACE.s12,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER_WIDTH.w1,
  },
  linkText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
  pointsCard: {
    width: '100%',
    borderRadius: RADIUS.r16,
    borderWidth: BORDER_WIDTH.w1,
    marginTop: SPACE.s12,
    padding: SPACE.s12,
  },
  // Number, words, Best, arrow: side by side with real gaps, nothing placed over anything else.
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
  },
  pointsNumber: {
    flexShrink: 0,
    fontSize: FONT_SIZE.f24,
    lineHeight: LINE_HEIGHT.l28,
    fontFamily: FONTS.bold,
  },
  // The words take the room the numbers leave: they wrap to a second line or shrink, never the
  // numbers.
  pointsWords: {
    flex: 1,
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l20,
    fontFamily: FONTS.semiBold,
  },
  bestGroup: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
  },
  bestLabel: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
  },
  bestNumber: {
    flexShrink: 0,
    fontSize: FONT_SIZE.f17,
    lineHeight: LINE_HEIGHT.l22,
    fontFamily: FONTS.bold,
  },
  chevron: {
    flexShrink: 0,
    fontSize: FONT_SIZE.f20,
    lineHeight: LINE_HEIGHT.l22,
    fontFamily: FONTS.regular,
  },
  progressTrack: {
    width: '100%',
    height: SIZE.z8,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
    marginTop: SPACE.s8,
  },
  progressFill: {
    height: '100%',
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  pointsNote: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l18,
    marginTop: SPACE.s8,
  },
});
