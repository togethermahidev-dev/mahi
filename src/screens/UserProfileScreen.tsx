import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import {
  getProfile,
  createOrGetConversation,
  reportUser,
  hasReported,
  type ReportReason,
} from '@/api';
import { useAuthStore, useFollowStore, useBlockStore } from '@/store';
import { posthog } from '@/lib/posthog';
import { Sentry } from '@/lib/sentry';
import StreakGridPanel from '@/components/StreakGridPanel';
import FollowListModal from '@/components/FollowListModal';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import PostDetailModal from '@/components/PostDetailModal';
import ConversationScreen from '@/screens/ConversationScreen';
import type { ConversationPreview } from '@/api';
import type { Database } from '@/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

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

  const bg = dark ? '#1C1C19' : '#FFFFFF';
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';

  const isFollowing = useFollowStore((s) => s.followingByMe[userId] ?? false);
  const followerCount = useFollowStore((s) => s.counts[userId]?.follower_count ?? 0);
  const followingCount = useFollowStore((s) => s.counts[userId]?.following_count ?? 0);
  const loadFollowData = useFollowStore((s) => s.loadFollowData);
  const toggleFollow = useFollowStore((s) => s.toggleFollow);

  const isBlockedByMe = useBlockStore((s) => s.blockedByMe.has(userId));
  const isBlocked = useBlockStore((s) => s.blockedSet.has(userId));
  const blockAction = useBlockStore((s) => s.block);
  const unblockAction = useBlockStore((s) => s.unblock);

  // Keep a stable ref to onBack so the PanResponder closure always calls the
  // latest callback even if the parent re-renders with a new function identity.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Block all gestures from leaking to HorizontalNavigator behind this screen.
  // A horizontal swipe dismisses the profile instead of navigating underneath.
  const gestureBlocker = useRef(
    PanResponder.create({
      // Claim touch on start to block HorizontalNavigator behind this screen.
      onStartShouldSetPanResponder: () => true,
      // Only escalate to a move-claim for clear horizontal swipes (dismiss gesture).
      // The old () => true was stealing sloppy taps from child buttons.
      onMoveShouldSetPanResponder: (_e, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20,
      onPanResponderRelease: (_e, { dx, vx }) => {
        if (Math.abs(dx) > 60 || Math.abs(vx) > 0.4) {
          onBackRef.current();
        }
      },
      // Allow child TouchableOpacity elements to reclaim the touch.
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [streakGridOpen, setStreakGridOpen] = useState(false);
  const [followListOpen, setFollowListOpen] = useState(false);
  const [followListType, setFollowListType] = useState<'followers' | 'following'>('followers');
  const [reporting, setReporting] = useState(false);
  const [activeConvo, setActiveConvo] = useState<ConversationPreview | null>(null);
  const [selectedPost, setSelectedPost] = useState<
    Database['public']['Tables']['posts']['Row'] | null
  >(null);

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

    Alert.alert(`Report @${profile.username}?`, 'Select a reason:', [
      ...reasons.map((r) => ({
        text: r.label,
        onPress: async () => {
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
        },
      })),
      { text: 'Cancel', style: 'cancel', onPress: () => setReporting(false) },
    ]);
  };

  const handleEllipsis = () => {
    if (!profile) return;
    Alert.alert(`@${profile.username}`, '', [
      {
        text: isBlockedByMe ? 'Unblock' : 'Block',
        style: isBlockedByMe ? 'default' : 'destructive',
        onPress: isBlockedByMe ? handleUnblock : handleBlock,
      },
      { text: 'Report', onPress: handleReport },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]} {...gestureBlocker.panHandlers}>
      {/* Back button — top-left */}
      <TouchableOpacity
        onPress={onBack}
        style={[styles.backBtn, { borderColor: muted }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.backArrow, { color: muted }]}>‹</Text>
      </TouchableOpacity>

      {/* Ellipsis menu — top-right (only for other users) */}
      {!isSelf && !loading ? (
        <TouchableOpacity
          onPress={handleEllipsis}
          style={[styles.ellipsisBtn, { borderColor: muted }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
                    { backgroundColor: dark ? '#3A3A37' : '#E8E8E3' },
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

            {/* Follow counts */}
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.stat}
                activeOpacity={0.7}
                onPress={() => {
                  setFollowListType('followers');
                  setFollowListOpen(true);
                }}
              >
                <Text style={[styles.statValue, { color: text }]}>{followerCount}</Text>
                <Text style={[styles.statLabel, { color: muted }]}>FOLLOWERS</Text>
              </TouchableOpacity>
              <View style={[styles.statDivider, { backgroundColor: muted }]} />
              <TouchableOpacity
                style={styles.stat}
                activeOpacity={0.7}
                onPress={() => {
                  setFollowListType('following');
                  setFollowListOpen(true);
                }}
              >
                <Text style={[styles.statValue, { color: text }]}>{followingCount}</Text>
                <Text style={[styles.statLabel, { color: muted }]}>FOLLOWING</Text>
              </TouchableOpacity>
            </View>

            {/* Streak stats */}
            <View style={[styles.statsRow, { marginTop: 16 }]}>
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

            {/* Streak grid pill */}
            <TouchableOpacity
              onPress={() => setStreakGridOpen(true)}
              activeOpacity={0.75}
              style={[styles.streakTrackerPill, { borderColor: '#59c2d7' }]}
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
                      ? { borderColor: text, borderWidth: 1 }
                      : { backgroundColor: '#59c2d7' },
                  ]}
                  onPress={handleFollow}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.followBtnText, { color: isFollowing ? text : '#FFFFFF' }]}>
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
          </View>

          {/* Media grid */}
          {profile ? (
            <View style={[styles.mapShadow, { shadowColor: dark ? '#000' : '#1A1A17' }]}>
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

      {/* Followers / following list */}
      <FollowListModal
        visible={followListOpen}
        onClose={() => setFollowListOpen(false)}
        userId={userId}
        type={followListType}
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
      {selectedPost ? (
        <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 510,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
  },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 32,
    left: 24,
    zIndex: 1,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 20,
    fontFamily: 'JosefinSans_400Regular_Italic',
    lineHeight: 22,
  },
  ellipsisBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 32,
    right: 24,
    zIndex: 1,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ellipsisText: {
    fontSize: 16,
    fontFamily: 'JosefinSans_700Bold',
    lineHeight: 18,
    marginTop: -4,
  },
  loader: {
    marginTop: 120,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  avatarWrap: {
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontFamily: 'JosefinSans_700Bold',
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
  streakTrackerPill: {
    borderWidth: 1,
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakTrackerText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    color: '#59c2d7',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  followBtn: {
    borderRadius: 50,
    paddingHorizontal: 28,
    paddingVertical: 9,
  },
  followBtnText: {
    fontSize: 11,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 3,
  },
  messageBtn: {
    borderWidth: 1,
    borderRadius: 50,
    paddingHorizontal: 28,
    paddingVertical: 9,
  },
  messageBtnText: {
    fontSize: 11,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 3,
  },
  blockedWrap: {
    alignItems: 'center',
    paddingVertical: 120,
    gap: 12,
  },
  blockedTitle: {
    fontSize: 16,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 3,
  },
  blockedSubtitle: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  unblockBtn: {
    borderWidth: 1,
    borderRadius: 50,
    paddingHorizontal: 28,
    paddingVertical: 9,
    marginTop: 8,
  },
  unblockBtnText: {
    fontSize: 11,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 3,
  },
  mapShadow: {
    flex: 1,
    width: '100%',
    marginTop: 96,
  },
});
