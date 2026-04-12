import React, { useEffect, useState } from 'react';
import {
  Alert,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { getProfile, createOrGetConversation, reportUser, hasReported, type ReportReason } from '@/api';
import { useAuthStore, useFollowStore, useBlockStore } from '@/store';
import { posthog } from '@/lib/posthog';
import { Sentry } from '@/lib/sentry';
import { StreakIcon } from '@/components/ScreenIcons';
import StreakGridPanel from '@/components/StreakGridPanel';
import FollowListModal from '@/components/FollowListModal';
import type { ConversationPreview } from '@/api';
import type { Database } from '@/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface UserProfileOverlayProps {
  userId:      string;
  onClose:     () => void;
  onOpenConvo: (conversation: ConversationPreview) => void;
  dark:        boolean;
}

export default function UserProfileOverlay({
  userId,
  onClose,
  onOpenConvo,
  dark,
}: UserProfileOverlayProps): React.JSX.Element {
  const currentUserId = useAuthStore((s) => s.user?.id);

  const text     = dark ? '#E8E8E3' : '#1A1A17';
  const muted    = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const cardBg   = dark ? '#2A2A27' : '#F5F5F2';
  const avatarBg = dark ? '#3A3A37' : '#E8E8E3';

  const isFollowing    = useFollowStore((s) => s.followingByMe[userId] ?? false);
  const followerCount  = useFollowStore((s) => s.counts[userId]?.follower_count ?? 0);
  const followingCount = useFollowStore((s) => s.counts[userId]?.following_count ?? 0);
  const loadFollowData = useFollowStore((s) => s.loadFollowData);
  const toggleFollow   = useFollowStore((s) => s.toggleFollow);

  const isBlockedByMe = useBlockStore((s) => s.blockedByMe.has(userId));
  const isBlocked     = useBlockStore((s) => s.blockedSet.has(userId));
  const blockAction   = useBlockStore((s) => s.block);
  const unblockAction = useBlockStore((s) => s.unblock);

  const [profile,   setProfile]   = useState<ProfileRow | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [streakGridOpen, setStreakGridOpen] = useState(false);
  const [followListOpen, setFollowListOpen] = useState(false);
  const [followListType, setFollowListType] = useState<'followers' | 'following'>('followers');
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (currentUserId) loadFollowData(currentUserId, userId);
  }, [userId, currentUserId, loadFollowData]);

  useEffect(() => {
    console.log('[UserProfile] open |', userId);
    Sentry.addBreadcrumb({ category: 'profile', message: `Profile overlay opened: ${userId}`, level: 'info' });
    getProfile(userId)
      .then(({ data, error }) => {
        if (error) {
          console.log('[UserProfile] fetch error |', userId, error.message);
          Sentry.captureMessage(error.message, { level: 'warning', tags: { flow: 'profile', step: 'fetch' }, extra: { userId } });
        } else {
          console.log('[UserProfile] loaded |', data?.username ?? userId);
        }
        setProfile(data ?? null);
        setLoading(false);
      })
      .catch((e) => {
        console.log('[UserProfile] fetch exception |', userId, e);
        Sentry.captureException(e, { tags: { flow: 'profile', step: 'fetch' }, extra: { userId } });
        setProfile(null);
        setLoading(false);
      });
  }, [userId]);

  const displayName = profile?.display_name ?? profile?.first_name ?? profile?.username ?? '—';
  const initials    = displayName[0]?.toUpperCase() ?? '?';

  const handleMessage = async () => {
    if (!currentUserId || !profile || messaging) return;
    console.log('[UserProfile] MESSAGE tap |', userId, '| user:', profile.username);
    Sentry.addBreadcrumb({ category: 'profile', message: `Message tapped: ${profile.username}`, level: 'info' });
    setMessaging(true);
    try {
      const { data, error } = await createOrGetConversation(currentUserId, userId);
      setMessaging(false);
      if (error) {
        console.log('[UserProfile] createOrGetConversation error |', error.message);
        Sentry.captureMessage(error.message, { level: 'warning', tags: { flow: 'profile', step: 'message' }, extra: { userId } });
        return;
      }
      if (data) {
        console.log('[UserProfile] conversation opened |', data.id);
        onOpenConvo(data);
        onClose();
      }
    } catch (e) {
      console.log('[UserProfile] createOrGetConversation exception |', e);
      Sentry.captureException(e, { tags: { flow: 'profile', step: 'message' }, extra: { userId } });
      setMessaging(false);
    }
  };

  const handleFollow = async () => {
    if (!currentUserId) return;
    console.log('[UserProfile] FOLLOW tap |', userId, '| action:', isFollowing ? 'unfollow' : 'follow');
    Sentry.addBreadcrumb({ category: 'profile', message: `Follow toggled: ${userId}`, level: 'info' });
    const { error } = await toggleFollow(currentUserId, userId);
    if (error) {
      console.log('[UserProfile] toggleFollow error |', error.message);
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
      'They won\'t be able to see your posts, message you, or follow you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            posthog.capture('user_blocked', { blocked_user_id: userId });
            Sentry.addBreadcrumb({ category: 'moderation', message: `Blocked: ${userId}`, level: 'info' });
            const { error } = await blockAction(currentUserId, userId);
            if (error) {
              Sentry.captureMessage(error.message, {
                level: 'warning',
                tags: { flow: 'moderation', step: 'block' },
                extra: { userId },
              });
            }
            onClose();
          },
        },
      ],
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
            Sentry.addBreadcrumb({ category: 'moderation', message: `Unblocked: ${userId}`, level: 'info' });
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
      ],
    );
  };

  const handleReport = async () => {
    if (!currentUserId || !profile || reporting) return;
    setReporting(true);

    // Check if already reported
    const { data: alreadyReported } = await hasReported(currentUserId, userId);
    if (alreadyReported) {
      setReporting(false);
      Alert.alert('Already Reported', `You have already reported @${profile.username}.`);
      return;
    }

    const reasons: { label: string; value: ReportReason }[] = [
      { label: 'Spam',                  value: 'spam' },
      { label: 'Harassment',            value: 'harassment' },
      { label: 'Inappropriate Content', value: 'inappropriate_content' },
      { label: 'Impersonation',         value: 'impersonation' },
      { label: 'Other',                 value: 'other' },
    ];

    Alert.alert(
      `Report @${profile.username}?`,
      'Select a reason:',
      [
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
              reporterId:     currentUserId,
              reportedUserId: userId,
              reason:         r.value,
            });
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
      ],
    );
  };

  const handleEllipsis = () => {
    if (!profile) return;
    Alert.alert(
      `@${profile.username}`,
      '',
      [
        {
          text: isBlockedByMe ? 'Unblock' : 'Block',
          style: isBlockedByMe ? 'default' : 'destructive',
          onPress: isBlockedByMe ? handleUnblock : handleBlock,
        },
        { text: 'Report', onPress: handleReport },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const isSelf = currentUserId === userId;

  return (
    <View style={styles.backdrop}>
      {/* Tapping the backdrop closes */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        {/* Back / close button */}
        <TouchableOpacity
          onPress={onClose}
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
          /* Block gate — minimal card for blocked users */
          <View style={styles.blockedWrap}>
            <Text style={[styles.blockedTitle, { color: text }]}>User Unavailable</Text>
            <Text style={[styles.blockedSubtitle, { color: muted }]}>
              {isBlockedByMe
                ? 'You have blocked this user.'
                : 'This content is not available.'}
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
            <View style={styles.avatarWrap}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
                  <Text style={[styles.avatarInitial, { color: cardBg }]}>{initials}</Text>
                </View>
              )}
            </View>

            <Text style={[styles.displayName, { color: text }]}>{displayName}</Text>
            {profile?.username ? (
              <Text style={[styles.handle, { color: muted }]}>@{profile.username}</Text>
            ) : null}

            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.stat}
                activeOpacity={0.7}
                onPress={() => { setFollowListType('followers'); setFollowListOpen(true); }}
              >
                <Text style={[styles.statValue, { color: text }]}>{followerCount}</Text>
                <Text style={[styles.statLabel, { color: muted }]}>FOLLOWERS</Text>
              </TouchableOpacity>
              <View style={[styles.statDivider, { backgroundColor: muted }]} />
              <TouchableOpacity
                style={styles.stat}
                activeOpacity={0.7}
                onPress={() => { setFollowListType('following'); setFollowListOpen(true); }}
              >
                <Text style={[styles.statValue, { color: text }]}>{followingCount}</Text>
                <Text style={[styles.statLabel, { color: muted }]}>FOLLOWING</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: text }]}>{profile?.streak_current ?? 0}</Text>
                <Text style={[styles.statLabel, { color: muted }]}>STREAK</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: muted }]} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: text }]}>{profile?.streak_highest ?? 0}</Text>
                <Text style={[styles.statLabel, { color: muted }]}>BEST</Text>
              </View>
            </View>

            {/* Streak grid pill */}
            <TouchableOpacity
              onPress={() => setStreakGridOpen(true)}
              activeOpacity={0.75}
              style={styles.streakPill}
            >
              <StreakIcon size={16} color="#59c2d7" />
            </TouchableOpacity>

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
          </>
        )}
      </View>

      {/* Streak accountability grid — slides in from left */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex:          510,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  card: {
    width:             '80%',
    borderRadius:      20,
    paddingTop:        16,
    paddingBottom:     28,
    paddingHorizontal: 24,
    alignItems:        'center',
    gap:               6,
  },
  backBtn: {
    position:       'absolute',
    top:            12,
    left:           16,
    zIndex:         1,
    width:          36,
    height:         36,
    borderRadius:   18,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize:   20,
    fontFamily: 'JosefinSans_400Regular_Italic',
    lineHeight: 22,
  },
  loader: {
    marginVertical: 40,
  },
  avatarWrap: {
    marginBottom: 12,
  },
  avatar: {
    width:        80,
    height:       80,
    borderRadius: 40,
  },
  avatarFallback: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize:   28,
    fontFamily: 'JosefinSans_700Bold',
  },
  displayName: {
    fontSize:      18,
    fontFamily:    'JosefinSans_700Bold',
    letterSpacing: 3,
    textAlign:     'center',
    marginBottom:  2,
  },
  handle: {
    fontSize:      13,
    fontFamily:    'JosefinSans_400Regular_Italic',
    marginBottom:  16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           24,
    marginBottom:  20,
  },
  stat: {
    alignItems: 'center',
    gap:        3,
  },
  statValue: {
    fontSize:   22,
    fontFamily: 'JosefinSans_700Bold',
    lineHeight: 22,
  },
  statLabel: {
    fontSize:      9,
    fontFamily:    'JosefinSans_600SemiBold',
    letterSpacing: 3,
  },
  statDivider: {
    width:   1,
    height:  32,
    opacity: 0.3,
  },
  streakPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection:  'row',
    gap:            12,
    marginTop:      4,
  },
  followBtn: {
    borderRadius:      50,
    paddingHorizontal: 28,
    paddingVertical:   9,
  },
  followBtnText: {
    fontSize:      11,
    fontFamily:    'JosefinSans_700Bold',
    letterSpacing: 3,
  },
  messageBtn: {
    borderWidth:       1,
    borderRadius:      50,
    paddingHorizontal: 28,
    paddingVertical:   9,
  },
  messageBtnText: {
    fontSize:      11,
    fontFamily:    'JosefinSans_700Bold',
    letterSpacing: 3,
  },
  ellipsisBtn: {
    position:       'absolute',
    top:            12,
    right:          16,
    zIndex:         1,
    width:          36,
    height:         36,
    borderRadius:   18,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  ellipsisText: {
    fontSize:    16,
    fontFamily:  'JosefinSans_700Bold',
    lineHeight:  18,
    marginTop:   -4,
  },
  blockedWrap: {
    alignItems:   'center',
    paddingVertical: 32,
    gap:          12,
  },
  blockedTitle: {
    fontSize:      16,
    fontFamily:    'JosefinSans_700Bold',
    letterSpacing: 3,
  },
  blockedSubtitle: {
    fontSize:   13,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign:  'center',
    paddingHorizontal: 16,
  },
  unblockBtn: {
    borderWidth:       1,
    borderRadius:      50,
    paddingHorizontal: 28,
    paddingVertical:   9,
    marginTop:         8,
  },
  unblockBtnText: {
    fontSize:      11,
    fontFamily:    'JosefinSans_700Bold',
    letterSpacing: 3,
  },
});
