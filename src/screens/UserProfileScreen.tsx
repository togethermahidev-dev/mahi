import React, { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Dimensions,
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getProfile,
  createOrGetConversation,
  reportUser,
  hasReported,
  type ReportReason,
} from '@/api';
import { useAuthStore, useFollowStore, useBlockStore } from '@/store';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { posthog } from '@/lib/posthog';
import { Sentry } from '@/lib/sentry';
import StreakGridPanel from '@/components/StreakGridPanel';
import FollowListModal from '@/components/FollowListModal';
import SuggestedFollowsStrip from '@/components/SuggestedFollowsStrip';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import PostDetailModal from '@/components/PostDetailModal';
import ConversationScreen from '@/screens/ConversationScreen';
import type { ConversationPreview } from '@/api';
import type { Database } from '@/types';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  SPACE,
  RADIUS,
  OFFSET,
  BORDER_WIDTH,
  SIZE,
  LINE_HEIGHT,
  TRACKING,
} from '@/constants/tokens';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

const SCREEN_WIDTH = Dimensions.get('window').width;

/** How far the finger moves sideways before the swipe takes over (up/down that far cancels it). */
const SWIPE_SLOP = 20;
/** A swipe closes the profile past this distance (px) or speed (px/s). */
const SWIPE_CLOSE_PX = 60;
const SWIPE_CLOSE_VX = 400;

interface UserProfileScreenProps {
  userId: string;
  onBack: () => void;
  dark: boolean;
}

export default function UserProfileScreen({
  userId,
  onBack,
  dark,
}: UserProfileScreenProps): React.JSX.Element {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const top = useSafeAreaInsets().top;

  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);

  const isFollowing = useFollowStore((s) => s.followingByMe[userId] ?? false);
  const loadFollowData = useFollowStore((s) => s.loadFollowData);
  const toggleFollow = useFollowStore((s) => s.toggleFollow);

  const isBlockedByMe = useBlockStore((s) => s.blockedByMe.has(userId));
  const isBlocked = useBlockStore((s) => s.blockedSet.has(userId));
  const blockAction = useBlockStore((s) => s.block);
  const unblockAction = useBlockStore((s) => s.unblock);

  // Keep a stable ref to onBack so the swipe always calls the latest callback
  // even if the parent re-renders with a new function identity.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Entrance animation: spring the overlay in from the right (SCREEN_WIDTH → 0)
  // on mount so every caller (notifications, feed, search) gets the same motion
  // for free. Same spring params as HorizontalNavigator page changes.
  const translateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  const [profile, setProfile] = useState<(ProfileRow & { points?: number }) | null>(null);
  const showPoints = useFeatureFlag('mahi-points');
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [streakGridOpen, setStreakGridOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [activeConvo, setActiveConvo] = useState<ConversationPreview | null>(null);
  const [selectedPost, setSelectedPost] = useState<
    Database['public']['Tables']['posts']['Row'] | null
  >(null);
  const [suggestedUserId, setSuggestedUserId] = useState<string | null>(null);

  // Swipe sideways to close. The pan only takes over once the finger has clearly moved
  // sideways, so taps and up/down scrolls stay with the buttons and lists inside. Off while a
  // screen opened from here is on top, so a swipe there closes that one only.
  const swipeBack = Gesture.Pan()
    .runOnJS(true)
    .enabled(!suggestedUserId && !activeConvo)
    .activeOffsetX([-SWIPE_SLOP, SWIPE_SLOP])
    .failOffsetY([-SWIPE_SLOP, SWIPE_SLOP])
    // A swipe during the entrance spring freezes it where it is, so the screen doesn't jump.
    .onStart(() => translateX.stopAnimation())
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_CLOSE_PX || Math.abs(e.velocityX) > SWIPE_CLOSE_VX) {
        onBackRef.current();
      }
    });

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: 0,
      damping: 22,
      stiffness: 160,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  useEffect(() => {
    if (currentUserId) loadFollowData(currentUserId, userId);
  }, [userId, currentUserId, loadFollowData]);

  useEffect(() => {
    Sentry.addBreadcrumb({
      category: 'profile',
      message: `User profile opened: ${userId}`,
      level: 'info',
    });
    getProfile(userId)
      .then(({ data, error }) => {
        if (error) {
          Sentry.captureMessage(error.message, {
            level: 'warning',
            tags: { flow: 'profile', step: 'fetch' },
            extra: { userId },
          });
        }
        setProfile(data ?? null);
        setLoading(false);
      })
      .catch((e) => {
        Sentry.captureException(e, { tags: { flow: 'profile', step: 'fetch' }, extra: { userId } });
        setProfile(null);
        setLoading(false);
      });
  }, [userId]);

  const displayName = profile?.display_name ?? profile?.first_name ?? profile?.username ?? '—';
  const initials = displayName[0]?.toUpperCase() ?? '?';
  const isSelf = currentUserId === userId;

  const handleMessage = async () => {
    if (!currentUserId || !profile || messaging) return;
    Sentry.addBreadcrumb({
      category: 'profile',
      message: `Message tapped: ${profile.username}`,
      level: 'info',
    });
    setMessaging(true);
    try {
      const { data, error } = await createOrGetConversation(currentUserId, userId);
      setMessaging(false);
      if (error) {
        Sentry.captureMessage(error.message, {
          level: 'warning',
          tags: { flow: 'profile', step: 'message' },
          extra: { userId },
        });
        return;
      }
      if (data) {
        setActiveConvo(data);
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { flow: 'profile', step: 'message' }, extra: { userId } });
      setMessaging(false);
    }
  };

  const handleFollow = async () => {
    if (!currentUserId) return;
    Sentry.addBreadcrumb({
      category: 'profile',
      message: `Follow toggled: ${userId}`,
      level: 'info',
    });
    const { error } = await toggleFollow(currentUserId, userId);
    if (error) {
      Sentry.captureMessage(error.message, {
        level: 'warning',
        tags: { flow: 'profile', step: 'follow' },
        extra: { userId, action: isFollowing ? 'unfollow' : 'follow' },
      });
    }
  };

  const handleBlock = () => {
    if (!currentUserId || !profile) return;
    Alert.alert(
      `Block @${profile.username}?`,
      "They won't be able to see your posts, message you, or follow you.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            posthog.capture('user_blocked', { blocked_user_id: userId });
            Sentry.addBreadcrumb({
              category: 'moderation',
              message: `Blocked: ${userId}`,
              level: 'info',
            });
            const { error } = await blockAction(currentUserId, userId);
            if (error) {
              Sentry.captureMessage(error.message, {
                level: 'warning',
                tags: { flow: 'moderation', step: 'block' },
                extra: { userId },
              });
            }
            onBack();
          },
        },
      ]
    );
  };

  const handleUnblock = () => {
    if (!currentUserId || !profile) return;
    Alert.alert(
      `Unblock @${profile.username}?`,
      'They will be able to see your posts and message you again. You will need to re-follow each other.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            posthog.capture('user_unblocked', { unblocked_user_id: userId });
            Sentry.addBreadcrumb({
              category: 'moderation',
              message: `Unblocked: ${userId}`,
              level: 'info',
            });
            const { error } = await unblockAction(currentUserId, userId);
            if (error) {
              Sentry.captureMessage(error.message, {
                level: 'warning',
                tags: { flow: 'moderation', step: 'unblock' },
                extra: { userId },
              });
            }
          },
        },
      ]
    );
  };

  const handleReport = async () => {
    if (!currentUserId || !profile || reporting) return;
    setReporting(true);

    const { data: alreadyReported } = await hasReported(currentUserId, userId);
    if (alreadyReported) {
      setReporting(false);
      Alert.alert('Already Reported', `You have already reported @${profile.username}.`);
      return;
    }

    const reasons: { label: string; value: ReportReason }[] = [
      { label: 'Spam', value: 'spam' },
      { label: 'Harassment', value: 'harassment' },
      { label: 'Inappropriate Content', value: 'inappropriate_content' },
      { label: 'Impersonation', value: 'impersonation' },
      { label: 'Other', value: 'other' },
    ];

    const submit = async (r: { label: string; value: ReportReason }) => {
      posthog.capture('user_reported', {
        reported_user_id: userId,
        reason: r.value,
        has_description: false,
      });
      Sentry.addBreadcrumb({
        category: 'moderation',
        message: `Reported: ${userId} reason: ${r.value}`,
        level: 'info',
      });
      const { error } = await reportUser({
        reporterId: currentUserId,
        reportedUserId: userId,
        reason: r.value,
      });
      setReporting(false);
      if (error) {
        Sentry.captureMessage(error.message, {
          level: 'warning',
          tags: { flow: 'moderation', step: 'report' },
          extra: { userId, reason: r.value },
        });
      } else {
        Alert.alert('Report Submitted', 'Thank you for helping keep the community safe.');
      }
    };

    // Native action sheet on iOS; Android has none, so an Alert lists the reasons.
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Report @${profile.username}?`,
          message: 'Select a reason:',
          options: [...reasons.map((r) => r.label), 'Cancel'],
          cancelButtonIndex: reasons.length,
        },
        (i) => {
          if (i < reasons.length) submit(reasons[i]);
          else setReporting(false);
        }
      );
    } else {
      Alert.alert(`Report @${profile.username}?`, 'Select a reason:', [
        ...reasons.map((r) => ({ text: r.label, onPress: () => submit(r) })),
        { text: 'Cancel', style: 'cancel', onPress: () => setReporting(false) },
      ]);
    }
  };

  const handleEllipsis = () => {
    if (!profile) return;
    const blockLabel = isBlockedByMe ? 'Unblock' : 'Block';
    const onBlock = isBlockedByMe ? handleUnblock : handleBlock;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `@${profile.username}`,
          options: [blockLabel, 'Report', 'Cancel'],
          destructiveButtonIndex: isBlockedByMe ? undefined : 0,
          cancelButtonIndex: 2,
        },
        (i) => {
          if (i === 0) onBlock();
          else if (i === 1) handleReport();
        }
      );
    } else {
      Alert.alert(`@${profile.username}`, '', [
        { text: blockLabel, style: isBlockedByMe ? 'default' : 'destructive', onPress: onBlock },
        { text: 'Report', onPress: handleReport },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <GestureDetector gesture={swipeBack}>
      <Animated.View
        style={[styles.root, { backgroundColor: bg, paddingTop: top, transform: [{ translateX }] }]}
      >
        {/* Back button — top-left */}
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backBtn, { top, borderColor: muted }]}
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <Text style={[styles.backArrow, { color: muted }]}>‹</Text>
        </TouchableOpacity>

        {/* Ellipsis menu — top-right (only for other users) */}
        {!isSelf && !loading ? (
          <TouchableOpacity
            onPress={handleEllipsis}
            style={[styles.ellipsisBtn, { top, borderColor: muted }]}
            hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
          >
            <Text style={[styles.ellipsisText, { color: muted }]}>...</Text>
          </TouchableOpacity>
        ) : null}

        {loading ? (
          <ActivityIndicator color={muted} style={styles.loader} />
        ) : isBlocked ? (
          <View style={styles.blockedWrap}>
            <Text style={[styles.blockedTitle, { color: text }]}>User Unavailable</Text>
            <Text style={[styles.blockedSubtitle, { color: muted }]}>
              {isBlockedByMe ? 'You have blocked this user.' : 'This content is not available.'}
            </Text>
            {isBlockedByMe ? (
              <TouchableOpacity
                style={[styles.unblockBtn, { borderColor: text }]}
                onPress={handleUnblock}
                activeOpacity={0.75}
              >
                <Text style={[styles.unblockBtnText, { color: text }]}>UNBLOCK</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <>
            {/* Profile header */}
            <View style={styles.header}>
              {/* Avatar */}
              <View style={styles.avatarWrap}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      styles.avatarFallback,
                      { backgroundColor: dark ? COLORS.borderDark : COLORS.offWhite },
                    ]}
                  >
                    <Text style={[styles.avatarInitial, { color: bg }]}>{initials}</Text>
                  </View>
                )}
              </View>

              {/* Name + handle */}
              <Text style={[styles.displayName, { color: text }]}>{displayName}</Text>
              {profile?.username ? (
                <Text style={[styles.handle, { color: muted }]}>@{profile.username}</Text>
              ) : null}

              {/* Friends — a list, never a number */}
              <TouchableOpacity
                style={styles.statsRow}
                activeOpacity={0.7}
                onPress={() => setFriendsOpen(true)}
              >
                <Text style={[styles.statLabel, { color: muted }]}>FRIENDS ›</Text>
              </TouchableOpacity>

              {/* Streak stats */}
              <View style={[styles.statsRow, { marginTop: SPACE.s16 }]}>
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
                {showPoints ? (
                  <>
                    <View style={[styles.statDivider, { backgroundColor: muted }]} />
                    <View style={styles.stat}>
                      <Text style={[styles.statValue, { color: text }]}>
                        {profile?.points ?? 0}
                      </Text>
                      <Text style={[styles.statLabel, { color: muted }]}>🔥 POINTS</Text>
                    </View>
                  </>
                ) : null}
              </View>

              {/* Streak grid pill */}
              <TouchableOpacity
                onPress={() => setStreakGridOpen(true)}
                activeOpacity={0.75}
                style={[styles.streakTrackerPill, { borderColor: COLORS.accent }]}
              >
                <Text style={styles.streakTrackerText}>STREAK TRACKER</Text>
              </TouchableOpacity>

              {/* Follow / Message actions */}
              {!isSelf ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[
                      styles.followBtn,
                      isFollowing
                        ? { borderColor: text, borderWidth: BORDER_WIDTH.w1 }
                        : { backgroundColor: COLORS.accent },
                    ]}
                    onPress={handleFollow}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[styles.followBtnText, { color: isFollowing ? text : COLORS.white }]}
                    >
                      {isFollowing ? 'FOLLOWING' : 'FOLLOW'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.messageBtn, { borderColor: text, opacity: messaging ? 0.5 : 1 }]}
                    onPress={handleMessage}
                    activeOpacity={0.75}
                    disabled={messaging}
                  >
                    <Text style={[styles.messageBtnText, { color: text }]}>
                      {messaging ? '…' : 'MESSAGE'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Suggested follows — syncs on mount, renders null when empty.
                Excludes the profile being viewed so we never suggest this page. */}
              <SuggestedFollowsStrip onPressUser={setSuggestedUserId} excludeUserId={userId} />
            </View>

            {/* Media grid */}
            {profile ? (
              <View
                style={[styles.mapShadow, { shadowColor: dark ? COLORS.black : COLORS.offBlack }]}
              >
                <ProfileMediaMap userId={profile.id} isSelf={false} onPostPress={setSelectedPost} />
              </View>
            ) : null}
          </>
        )}

        {/* Streak accountability grid */}
        {profile ? (
          <StreakGridPanel
            visible={streakGridOpen}
            onClose={() => setStreakGridOpen(false)}
            userId={userId}
            streakCurrent={profile.streak_current ?? 0}
            streakHighest={profile.streak_highest ?? 0}
            streakLastUploadDate={profile.streak_last_upload_date ?? null}
            fitnessRoutine={profile.fitness_routine ?? null}
            dark={dark}
          />
        ) : null}

        {/* Friends list */}
        <FollowListModal
          visible={friendsOpen}
          onClose={() => setFriendsOpen(false)}
          userId={userId}
          type="friends"
          dark={dark}
        />

        {/* Conversation screen — opened from MESSAGE button */}
        {activeConvo && currentUserId ? (
          <ConversationScreen
            conversation={activeConvo}
            currentUserId={currentUserId}
            onBack={() => setActiveConvo(null)}
          />
        ) : null}

        {/* Post detail — opened when a grid cell is tapped */}
        <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />

        {/* Suggested user's profile — opened from a suggestion card */}
        {suggestedUserId ? (
          <UserProfileScreen
            key={suggestedUserId}
            userId={suggestedUserId}
            onBack={() => setSuggestedUserId(null)}
            dark={dark}
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 510,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  backBtn: {
    position: 'absolute',
    left: OFFSET.o24,
    zIndex: 1,
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.italic,
    lineHeight: LINE_HEIGHT.l22,
  },
  ellipsisBtn: {
    position: 'absolute',
    right: OFFSET.o24,
    zIndex: 1,
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ellipsisText: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l18,
    marginTop: -SPACE.s4,
  },
  loader: {
    marginTop: SPACE.s120,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: SPACE.s32,
    width: '100%',
  },
  avatarWrap: {
    marginBottom: SPACE.s12,
  },
  avatar: {
    width: SIZE.z80,
    height: SIZE.z80,
    borderRadius: RADIUS.r40,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f28,
    fontFamily: FONTS.bold,
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
    fontFamily: FONTS.italic,
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
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.semiBold,
    letterSpacing: TRACKING.t3,
  },
  statDivider: {
    width: SIZE.z1,
    height: SIZE.z40,
    opacity: 0.3,
  },
  streakTrackerPill: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s6,
    marginTop: SPACE.s16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakTrackerText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f10,
    letterSpacing: TRACKING.t2,
    color: COLORS.accent,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACE.s12,
    marginTop: SPACE.s20,
  },
  followBtn: {
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s28,
    paddingVertical: SPACE.s9,
  },
  followBtnText: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t3,
  },
  messageBtn: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s28,
    paddingVertical: SPACE.s9,
  },
  messageBtnText: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t3,
  },
  blockedWrap: {
    alignItems: 'center',
    paddingVertical: SPACE.s120,
    gap: SPACE.s12,
  },
  blockedTitle: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t3,
  },
  blockedSubtitle: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
    textAlign: 'center',
    paddingHorizontal: SPACE.s16,
  },
  unblockBtn: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s28,
    paddingVertical: SPACE.s9,
    marginTop: SPACE.s8,
  },
  unblockBtnText: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t3,
  },
  mapShadow: {
    flex: 1,
    width: '100%',
    marginTop: SPACE.s96,
  },
});
