import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { backSwipeCloses, backSwipeX } from '@/lib/swipeRules';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getProfile,
  createOrGetConversation,
  reportUser,
  hasReported,
  type ReportReason,
} from '@/api';
import { useAuthStore, useFollowStore, useBlockStore } from '@/store';
import { pointsStatsLabel } from '@/lib/mahiPoints';
import { useCoverRail } from '@/hooks/useChrome';
import { posthog } from '@/lib/posthog';
import { Sentry } from '@/lib/sentry';
import FollowListModal from '@/components/FollowListModal';
import SuggestedFollowsStrip from '@/components/SuggestedFollowsStrip';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import PostViewer from '@/components/PostViewer';
import AvatarViewer from '@/components/AvatarViewer';
import ConversationScreen from '@/screens/ConversationScreen';
import type { ConversationPreview } from '@/api';
import type { Database } from '@/types';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  LAYER,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  SPRING,
  SWIPE,
  TRACKING,
  VIEWER,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/** How far the finger moves sideways before the swipe takes over (up/down that far cancels it). */
/** The page swipe's spring (HorizontalNavigator), in and back. Runs even with Reduce Motion on. */
const PAGE_SPRING = { ...SPRING.page, reduceMotion: ReduceMotion.Never };

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
  // Full screen over a page: the glass bar hides while it's open (as it does over the Feed).
  useCoverRail(true);

  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted } = themeColors(dark);

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

  // Slides in from the right on open (every caller gets the same motion), follows the finger on a
  // swipe right, and slides back out to close — on the UI thread, like the page swipes.
  const { width } = useWindowDimensions();
  const x = useSharedValue(width);
  const startX = useSharedValue(0);
  const closing = useSharedValue(false);
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const close = () => {
    closing.value = true;
    x.value = withTiming(width, { duration: VIEWER.closeMs }, (done) => {
      if (done) scheduleOnRN(onBackRef.current);
    });
  };

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [activeConvo, setActiveConvo] = useState<ConversationPreview | null>(null);
  const [viewerPostId, setViewerPostId] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [suggestedUserId, setSuggestedUserId] = useState<string | null>(null);

  // The page is one scrolling list. Its scrolling is a gesture the swipe back runs alongside:
  // a vertical list grabs a touch after ~10pt in any direction, before the swipe decides.
  const pageList = useMemo(() => Gesture.Native(), []);

  // Swipe right to close. The pan only takes over once the finger has clearly moved right, so
  // taps and up/down scrolls stay with the buttons and lists inside. Off while a screen opened
  // from here is on top, so a swipe there closes that one only.
  const swipeBack = Gesture.Pan()
    .enabled(!suggestedUserId && !activeConvo)
    .simultaneousWithExternalGesture(pageList)
    .activeOffsetX(SWIPE.slop)
    .failOffsetX(-SWIPE.slop)
    .failOffsetY([-SWIPE.slop, SWIPE.slop])
    .onStart(() => {
      'worklet';
      // A swipe during the slide in takes it from where it is, so the screen doesn't jump.
      cancelAnimation(x);
      startX.value = x.value;
    })
    .onUpdate((e) => {
      'worklet';
      if (!closing.value) x.value = backSwipeX(startX.value, e.translationX);
    })
    .onEnd((e) => {
      'worklet';
      if (closing.value) return;
      if (backSwipeCloses(e.translationX, e.velocityX / 1000)) {
        closing.value = true;
        x.value = withTiming(width, { duration: VIEWER.closeMs }, (done) => {
          if (done) scheduleOnRN(onBackRef.current);
        });
      } else {
        x.value = withSpring(0, PAGE_SPRING);
      }
    });

  useEffect(() => {
    x.value = withSpring(0, PAGE_SPRING);
  }, [x]);

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
      Alert.alert('Already reported', `You have already reported @${profile.username}.`);
      return;
    }

    const reasons: { label: string; value: ReportReason }[] = [
      { label: 'Spam', value: 'spam' },
      { label: 'Harassment', value: 'harassment' },
      { label: 'Inappropriate content', value: 'inappropriate_content' },
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
        Alert.alert('Report submitted', 'Thank you for helping keep the community safe.');
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

  // Back and the menu: in the header's top corners, so they scroll away with it (or at the top
  // of the page while it loads or is blocked).
  const topButtons = (
    <>
      {/* Back button — top-left */}
      <Pressable
        style={({ pressed }) => [
          styles.backBtn,
          { borderColor: muted },
          pressed && { opacity: ALPHA.a20 },
        ]}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
      >
        <Text style={[styles.backArrow, { color: muted }]}>‹</Text>
      </Pressable>

      {/* Ellipsis menu — top-right (only for other users) */}
      {!isSelf && !loading ? (
        <Pressable
          style={({ pressed }) => [
            styles.ellipsisBtn,
            { borderColor: muted },
            pressed && { opacity: ALPHA.a20 },
          ]}
          onPress={handleEllipsis}
          accessibilityRole="button"
          accessibilityLabel="More options"
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <Text style={[styles.ellipsisText, { color: muted }]}>...</Text>
        </Pressable>
      ) : null}
    </>
  );

  // Everything above the grid. The page is one list, so this scrolls away and the grid can
  // fill the screen.
  const header = (
    <View style={styles.header}>
      {topButtons}

      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {profile?.avatar_url ? (
          // Tap: the photo full screen (pinch to zoom, swipe to close).
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={`View @${profile.username}'s profile photo`}
            onPress={() => setAvatarOpen(true)}
            style={({ pressed }) => pressed && { opacity: ALPHA.a90 }}
          >
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          </Pressable>
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
      <Pressable
        style={({ pressed }) => [styles.statsRow, pressed && { opacity: ALPHA.a70 }]}
        onPress={() => setFriendsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Friends"
      >
        <Text style={[styles.statLabel, { color: muted }]}>Friends ›</Text>
      </Pressable>

      {/* Mahi points: one per post that answers a tag, back to 0 on a missed tag; Best stays */}
      <View
        style={[styles.statsRow, { marginTop: SPACE.s16 }]}
        accessible
        accessibilityLabel={pointsStatsLabel(profile?.streak_current, profile?.streak_highest)}
      >
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: text }]}>{profile?.streak_current ?? 0}</Text>
          <Text style={[styles.statLabel, { color: muted }]}>Points</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: muted }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: text }]}>{profile?.streak_highest ?? 0}</Text>
          <Text style={[styles.statLabel, { color: muted }]}>Best</Text>
        </View>
      </View>

      {/* Follow / Message actions */}
      {!isSelf ? (
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.followBtn,
              isFollowing
                ? { borderColor: text, borderWidth: BORDER_WIDTH.w1 }
                : { backgroundColor: COLORS.accent },
              pressed && { opacity: ALPHA.a75 },
            ]}
            onPress={handleFollow}
            accessibilityRole="button"
            accessibilityLabel={`Follow @${profile?.username ?? displayName}`}
            accessibilityState={{ selected: isFollowing }}
          >
            <Text style={[styles.followBtnText, { color: isFollowing ? text : COLORS.offBlack }]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.messageBtn,
              { borderColor: text, opacity: messaging ? ALPHA.a50 : 1 },
              pressed && { opacity: ALPHA.a75 },
            ]}
            onPress={handleMessage}
            accessibilityRole="button"
            accessibilityLabel={`Message @${profile?.username ?? displayName}`}
            accessibilityState={{ busy: messaging, disabled: messaging }}
            disabled={messaging}
          >
            {/* The label stays (hidden) while opening, so the button keeps its size. */}
            <Text style={[styles.messageBtnText, { color: text, opacity: messaging ? 0 : 1 }]}>
              Message
            </Text>
            {messaging ? <ActivityIndicator color={text} style={StyleSheet.absoluteFill} /> : null}
          </Pressable>
        </View>
      ) : null}

      {/* Suggested follows — syncs on mount, renders null when empty.
        Excludes the profile being viewed so we never suggest this page. */}
      <SuggestedFollowsStrip onPressUser={setSuggestedUserId} excludeUserId={userId} />
    </View>
  );

  return (
    <GestureDetector gesture={swipeBack}>
      <Reanimated.View style={[styles.root, { backgroundColor: bg, paddingTop: top }, slideStyle]}>
        {loading ? (
          <View style={styles.page}>
            {topButtons}
            <ActivityIndicator color={muted} style={styles.loader} />
          </View>
        ) : isBlocked ? (
          <View style={styles.page}>
            {topButtons}
            <View style={styles.blockedWrap}>
              <Text style={[styles.blockedTitle, { color: text }]}>User unavailable</Text>
              <Text style={[styles.blockedSubtitle, { color: muted }]}>
                {isBlockedByMe ? 'You have blocked this user.' : 'This content is not available.'}
              </Text>
              {isBlockedByMe ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.unblockBtn,
                    { borderColor: text },
                    pressed && { opacity: ALPHA.a75 },
                  ]}
                  onPress={handleUnblock}
                  accessibilityRole="button"
                >
                  <Text style={[styles.unblockBtnText, { color: text }]}>Unblock</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : profile ? (
          // The header and the media grid, scrolling as one page
          <ProfileMediaMap
            userId={profile.id}
            isSelf={false}
            header={header}
            onPostPress={(post) => setViewerPostId(post.id)}
            listGesture={pageList}
          />
        ) : (
          header
        )}

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

        {/* Their posts, full screen from the tapped one: up/down browses, sideways closes.
            Only posts the feed lock lets you open (see ProfileMediaMap) can be tapped. */}
        <PostViewer
          userId={userId}
          postId={viewerPostId}
          onClose={() => setViewerPostId(null)}
          onOpenProfile={(id) => {
            setViewerPostId(null);
            setSuggestedUserId(id);
          }}
        />

        {/* Their profile photo, full screen */}
        <AvatarViewer
          uri={avatarOpen ? (profile?.avatar_url ?? null) : null}
          onClose={() => setAvatarOpen(false)}
        />

        {/* Suggested user's profile — opened from a suggestion card */}
        {suggestedUserId ? (
          <UserProfileScreen
            key={suggestedUserId}
            userId={suggestedUserId}
            onBack={() => setSuggestedUserId(null)}
            dark={dark}
          />
        ) : null}
      </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: LAYER.profile,
    flex: 1,
  },
  // Loading or blocked: no list, just the top buttons and a message.
  page: {
    flex: 1,
    alignItems: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: 0,
    left: OFFSET.o24,
    zIndex: LAYER.raised,
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l22,
  },
  ellipsisBtn: {
    position: 'absolute',
    top: 0,
    right: OFFSET.o24,
    zIndex: LAYER.raised,
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
    paddingBottom: SPACE.s16,
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
  statDivider: {
    width: SIZE.z1,
    height: SIZE.z40,
    opacity: ALPHA.a30,
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
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
  messageBtn: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s28,
    paddingVertical: SPACE.s9,
  },
  messageBtnText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
  blockedWrap: {
    alignItems: 'center',
    paddingVertical: SPACE.s120,
    gap: SPACE.s12,
  },
  blockedTitle: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
  },
  blockedSubtitle: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
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
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
});
