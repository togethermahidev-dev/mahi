import React, { useEffect, useRef, useState } from 'react';
import {
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
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { backSwipeCloses, backSwipeX } from '@/lib/swipeRules';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProfile, createOrGetConversation } from '@/api';
import { startReport } from '@/lib/reportFlow';
import { showNativeMenu } from '@/lib/nativeMenu';
import { followButtonLabel, followErrorText, unfollowConfirm } from '@/lib/followBack';
import { useAuthStore, useFollowStore, useBlockStore, useProfilePostsStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { pointsCount } from '@/lib/mahiPoints';
import { useCoverRail } from '@/hooks/useChrome';
import { posthog } from '@/lib/posthog';
import { Sentry, reportError } from '@/lib/sentry';
import FollowListModal from '@/components/FollowListModal';
import SuggestedFollowsStrip from '@/components/SuggestedFollowsStrip';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import PostViewer from '@/components/PostViewer';
import AvatarViewer from '@/components/AvatarViewer';
import ProfileIdentityCard from '@/components/ProfileIdentityCard';
import ConversationScreen from '@/screens/ConversationScreen';
import type { ConversationPreview, PublicProfile } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  DURATION,
  FONT_SIZE,
  LAYER,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  SPRING,
  SWIPE,
  VIEWER,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';
import type { MorphSource } from '@/lib/morph';

type ProfileRow = PublicProfile;

/** How far the finger moves sideways before the swipe takes over (up/down that far cancels it). */
/** The page swipe's spring (HorizontalNavigator), in and back. Runs even with Reduce Motion on. */
const PAGE_SPRING = { ...SPRING.page, reduceMotion: ReduceMotion.Never };
/** With Reduce Motion on, the screen fades in and out instead of sliding (a fade is not motion). */
const FADE = { duration: DURATION.d200, reduceMotion: ReduceMotion.Never };

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
  const { muted, border, accentText } = themeColors(dark);
  const surface = dark ? COLORS.surfaceDark : COLORS.white;
  const softSurface = dark ? COLORS.surfaceDark2 : COLORS.paper;
  const iconSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);

  const isFollowing = useFollowStore((s) => s.followingByMe[userId] ?? false);
  const followsMe = useFollowStore((s) => s.followsMe[userId] ?? false);
  // Your follow request to their private account is waiting: "Requested", a tap takes it back.
  const isRequested = useFollowStore((s) => s.requestedByMe[userId] ?? false);
  // "Follow back", with "Follows you" above it, when they follow you and you don't follow them.
  const follow = followButtonLabel(isFollowing, followsMe, isRequested);
  // Their Controls hide their workouts from you (get_user_posts says why): no grid, no friends.
  const restricted = useProfilePostsStore((s) => (s.userId === userId ? s.restricted : null));
  // A restricted answer can still carry posts you're tagged on; those open as usual.
  const restrictedPosts = useProfilePostsStore((s) =>
    s.userId === userId && s.restricted ? s.posts.length : 0
  );
  const isPrivate = useFollowStore((s) => s.privateById[userId] ?? false);
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
  // With Reduce Motion on, it fades in and out instead (the finger-driven swipe still follows
  // the finger).
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(reduceMotion ? 0 : width);
  const fade = useSharedValue(reduceMotion ? 0 : 1);
  const startX = useSharedValue(0);
  const closing = useSharedValue(false);
  const slideStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: x.value }],
  }));
  const close = () => {
    closing.value = true;
    if (reduceMotion) {
      fade.value = withTiming(0, FADE, (done) => {
        if (done) scheduleOnRN(onBackRef.current);
      });
      return;
    }
    x.value = withTiming(width, { duration: VIEWER.closeMs }, (done) => {
      if (done) scheduleOnRN(onBackRef.current);
    });
  };
  const toast = (message: string) => useToastStore.getState().show(message);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  /** Bumped by "Try again" after a failed load, to read the profile again. */
  const [attempt, setAttempt] = useState(0);
  const [messaging, setMessaging] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [activeConvo, setActiveConvo] = useState<ConversationPreview | null>(null);
  const [viewerPost, setViewerPost] = useState<{
    postId: string;
    source?: MorphSource;
  } | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarSource, setAvatarSource] = useState<MorphSource | null>(null);
  const avatarRef = useRef<View>(null);
  const [suggestedUserId, setSuggestedUserId] = useState<string | null>(null);

  // Swipe right to close. The pan only takes over once the finger has clearly moved right, so
  // taps and up/down scrolls stay with the buttons and list inside. This intentionally matches
  // ConversationScreen: wrapping the FlashList in a second Native gesture made the list win and
  // caused profile dismissal to disappear on current gesture-handler builds.
  const swipeBack = Gesture.Pan()
    .enabled(!suggestedUserId && !activeConvo)
    .activeOffsetX([SWIPE.slop, SWIPE.slop])
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
    if (reduceMotion) fade.value = withTiming(1, FADE);
    else x.value = withSpring(0, PAGE_SPRING);
  }, [x, fade, reduceMotion]);

  useEffect(() => {
    if (currentUserId) loadFollowData(currentUserId, userId);
  }, [userId, currentUserId, loadFollowData]);

  // A follow that lets you in (or an unfollow that shuts you out) reads their workouts again.
  const followState = isFollowing ? 'following' : isRequested ? 'requested' : 'none';
  const lastFollowState = useRef(followState);
  useEffect(() => {
    const before = lastFollowState.current;
    lastFollowState.current = followState;
    if (before === followState) return;
    if (restricted || before === 'following') {
      void useProfilePostsStore.getState().sync(userId, true);
    }
  }, [followState, restricted, userId]);

  useEffect(() => {
    Sentry.addBreadcrumb({
      category: 'profile',
      message: `User profile opened: ${userId}`,
      level: 'info',
    });
    let live = true;
    getProfile(userId)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          reportError(error, {
            flow: 'profile',
            action: 'fetch',
            level: 'warning',
            extra: { userId },
          });
        }
        setProfile(data ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (!live) return;
        reportError(e, { flow: 'profile', action: 'fetch', extra: { userId } });
        setProfile(null);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [userId, attempt]);

  const retryLoad = () => {
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  const displayName = profile?.display_name ?? profile?.first_name ?? profile?.username ?? '';
  const initials = displayName[0]?.toUpperCase() ?? '?';
  // How they're named in messages: @username, or their name before the profile has one.
  const handle = profile?.username ? `@${profile.username}` : displayName || 'them';
  const isSelf = currentUserId === userId;

  const handleMessage = async () => {
    if (!currentUserId || !profile || messaging) return;
    Sentry.addBreadcrumb({
      category: 'profile',
      message: `Message tapped: ${userId}`,
      level: 'info',
    });
    setMessaging(true);
    try {
      const { data, error } = await createOrGetConversation(currentUserId, userId);
      setMessaging(false);
      if (error || !data) {
        if (error) {
          reportError(error, {
            flow: 'profile',
            action: 'message',
            level: 'warning',
            extra: { userId },
          });
        }
        toast(`Couldn’t open a chat with ${handle}. Try again.`);
        return;
      }
      setActiveConvo(data);
    } catch (e) {
      reportError(e, { flow: 'profile', action: 'message', extra: { userId } });
      setMessaging(false);
      toast(`Couldn’t open a chat with ${handle}. Try again.`);
    }
  };

  const runFollow = async () => {
    if (!currentUserId) return;
    const wasFollowing = isFollowing;
    const wasRequested = isRequested;
    Sentry.addBreadcrumb({
      category: 'profile',
      message: `Follow toggled: ${userId}`,
      level: 'info',
    });
    const { error } = await toggleFollow(currentUserId, userId);
    if (error) {
      reportError(error, {
        flow: 'profile',
        action: 'follow',
        level: 'warning',
        extra: {
          userId,
          direction: wasFollowing ? 'unfollow' : wasRequested ? 'cancelRequest' : 'follow',
        },
      });
      // The button has already gone back; say why.
      toast(
        wasFollowing
          ? `Couldn’t unfollow ${handle}. Try again.`
          : wasRequested
            ? 'Couldn’t take back your follow request. Try again.'
            : followErrorText(error.message, `Couldn’t follow ${handle}. Try again.`)
      );
    }
  };

  // Following → ask first: an unfollow can end tagging each other. Requested → taken back at once.
  const handleFollow = () => {
    if (!isFollowing) {
      void runFollow();
      return;
    }
    const ask = unfollowConfirm(handle, { followsYou: followsMe, isPrivate });
    Alert.alert(ask.title, ask.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unfollow', style: 'destructive', onPress: () => void runFollow() },
    ]);
  };

  const handleBlock = () => {
    if (!currentUserId || !profile) return;
    Alert.alert(
      `Block @${profile.username}?`,
      'You’ll stop following each other, and they won’t be able to see your posts or message you.',
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
              // Stay here: they aren't blocked.
              toast(`Couldn’t block ${handle}. Try again.`);
              return;
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
      'They’ll be able to see your posts and message you again. To tag each other, you’ll both need to follow again.',
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
              toast(`Couldn’t unblock ${handle}. Try again.`);
            }
          },
        },
      ]
    );
  };

  // Report with a reason (docs/moderation.md): the server says if it's a repeat, so no check first.
  const handleReport = () => {
    if (!currentUserId || !profile) return;
    Sentry.addBreadcrumb({ category: 'moderation', message: `Report: ${userId}`, level: 'info' });
    startReport('user', userId, `Report @${profile.username}?`);
  };

  const handleEllipsis = () => {
    if (!profile) return;
    showNativeMenu({
      title: `@${profile.username}`,
      actions: [
        isBlockedByMe
          ? { text: 'Unblock', run: handleUnblock }
          : { text: 'Block', destructive: true, run: handleBlock },
        { text: 'Report', run: handleReport },
      ],
    });
  };

  // One predictable app bar is used for the loaded, loading, blocked and error states.
  const topButtons = (
    <View style={styles.topBar}>
      <Pressable
        style={({ pressed }) => [
          styles.iconButton,
          { backgroundColor: iconSurface, borderColor: border },
          pressed && { opacity: ALPHA.a70 },
        ]}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
      >
        <Text style={[styles.backArrow, { color: text }]}>‹</Text>
      </Pressable>

      <View style={styles.titleBlock}>
        <Text style={[styles.screenTitle, { color: text }]}>Profile</Text>
      </View>

      {!isSelf && !loading && profile ? (
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: iconSurface, borderColor: border },
            pressed && { opacity: ALPHA.a70 },
          ]}
          onPress={handleEllipsis}
          accessibilityRole="button"
          accessibilityLabel="More options"
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <Text style={[styles.ellipsisText, { color: text }]}>…</Text>
        </Pressable>
      ) : (
        <View style={styles.iconSpacer} />
      )}
    </View>
  );

  // Everything above the grid. The page is one list, so this scrolls away and the grid can
  // fill the screen.
  const header = (
    <View style={styles.header}>
      {topButtons}

      <ProfileIdentityCard
        dark={dark}
        displayName={displayName}
        username={profile?.username}
        supportingText="Follow each other to share tags and keep moving together."
        avatar={
          profile?.avatar_url ? (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={`View @${profile.username}'s profile photo`}
              ref={avatarRef}
              onPress={() => {
                setAvatarSource(null);
                if (!avatarRef.current) {
                  setAvatarOpen(true);
                  return;
                }
                avatarRef.current.measureInWindow((avatarX, avatarY, width, height) => {
                  if (width > 0 && height > 0 && profile.avatar_url) {
                    setAvatarSource({
                      x: avatarX,
                      y: avatarY,
                      width,
                      height,
                      uri: profile.avatar_url,
                      borderRadius: width / 2,
                    });
                  }
                  setAvatarOpen(true);
                });
              }}
              style={({ pressed }) => pressed && { opacity: ALPHA.a90 }}
            >
              <Image
                source={{ uri: profile.avatar_url, cache: 'force-cache' }}
                style={styles.avatar}
              />
            </Pressable>
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: iconSurface }]}>
              <Text style={[styles.avatarInitial, { color: text }]}>{initials}</Text>
            </View>
          )
        }
      />

      <View style={[styles.profileDetails, { backgroundColor: surface, borderColor: border }]}>
        {/* Hidden with their workouts: someone you can't see doesn't show you their friends. */}
        {!restricted ? (
          <>
            <Pressable
              style={({ pressed }) => [styles.friendsLink, pressed && { opacity: ALPHA.a70 }]}
              onPress={() => setFriendsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Friends"
              accessibilityHint={`Shows ${handle}'s friends`}
            >
              <View>
                <Text style={[styles.detailLabel, { color: muted }]}>Community</Text>
                <Text style={[styles.detailTitle, { color: text }]}>Friends</Text>
              </View>
              <Text style={[styles.detailChevron, { color: muted }]}>›</Text>
            </Pressable>

            <View style={[styles.detailDivider, { backgroundColor: border }]} />
          </>
        ) : null}

        <View
          style={styles.bestMetric}
          accessible
          accessibilityLabel={`Best, ${pointsCount(profile?.streak_highest)}`}
        >
          <View>
            <Text style={[styles.detailLabel, { color: muted }]}>Mahi points</Text>
            <Text style={[styles.detailTitle, { color: text }]}>Personal best</Text>
          </View>
          <Text style={[styles.bestValue, { color: text }]}>{profile?.streak_highest ?? 0}</Text>
        </View>
      </View>

      {/* Follow / Message actions */}
      {!isSelf && follow.followsYou ? (
        <Text style={[styles.followsYou, { color: accentText }]}>Follows you</Text>
      ) : null}
      {!isSelf ? (
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.followBtn,
              isFollowing || isRequested
                ? { backgroundColor: softSurface, borderColor: border }
                : { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
              pressed && { opacity: ALPHA.a75 },
            ]}
            onPress={handleFollow}
            accessibilityRole="button"
            accessibilityLabel={`${follow.label} ${handle}`}
            accessibilityHint={
              isFollowing
                ? 'Asks before unfollowing'
                : isRequested
                  ? 'Takes back your follow request'
                  : undefined
            }
            accessibilityState={{ selected: isFollowing || isRequested }}
          >
            <Text
              style={[
                styles.followBtnText,
                { color: isFollowing || isRequested ? text : COLORS.offBlack },
              ]}
            >
              {follow.label}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.messageBtn,
              {
                backgroundColor: surface,
                borderColor: border,
                opacity: messaging ? ALPHA.a50 : 1,
              },
              pressed && { opacity: ALPHA.a75 },
            ]}
            onPress={handleMessage}
            accessibilityRole="button"
            accessibilityLabel={`Message ${handle}`}
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
      {!isSelf ? (
        <Text style={[styles.followHint, { color: muted }]}>
          Follow each other and you can tag each other.
        </Text>
      ) : null}

      {/* Suggested follows — syncs on mount, renders null when empty.
        Excludes the profile being viewed so we never suggest this page. */}
      <SuggestedFollowsStrip onPressUser={setSuggestedUserId} excludeUserId={userId} />

      <View style={styles.workoutsHeading}>
        <Text style={[styles.workoutsTitle, { color: text }]}>Workouts</Text>
        {!restricted || restrictedPosts > 0 ? (
          <Text style={[styles.workoutsSubtitle, { color: muted }]}>
            Tap a post to see it full screen.
          </Text>
        ) : null}
      </View>
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
              <Text style={[styles.blockedTitle, { color: text }]}>Profile unavailable</Text>
              <Text style={[styles.blockedSubtitle, { color: muted }]}>
                {isBlockedByMe ? `You’ve blocked ${handle}.` : 'You can’t see this profile.'}
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
            onPostPress={(post, source) => setViewerPost({ postId: post.id, source })}
            username={profile.username}
          />
        ) : (
          // The read failed: say so, with a way to try again (never a blank "0 points" profile).
          <View style={styles.page}>
            {topButtons}
            <View style={styles.blockedWrap}>
              <Text style={[styles.blockedTitle, { color: text }]}>Couldn’t load this profile</Text>
              <Text style={[styles.blockedSubtitle, { color: muted }]}>
                Check your connection and try again.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.unblockBtn,
                  { borderColor: text },
                  pressed && { opacity: ALPHA.a75 },
                ]}
                onPress={retryLoad}
                accessibilityRole="button"
              >
                <Text style={[styles.unblockBtnText, { color: text }]}>Try again</Text>
              </Pressable>
            </View>
          </View>
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
          postId={viewerPost?.postId ?? null}
          source={viewerPost?.source}
          onClose={() => setViewerPost(null)}
          onOpenProfile={(id) => {
            setViewerPost(null);
            setSuggestedUserId(id);
          }}
        />

        {/* Their profile photo, full screen */}
        <AvatarViewer
          uri={avatarOpen ? (profile?.avatar_url ?? null) : null}
          source={avatarSource}
          onClose={() => setAvatarOpen(false)}
          label={profile?.username ? `@${profile.username}’s profile photo` : null}
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
    paddingTop: SPACE.s12,
    paddingHorizontal: SPACE.s20,
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.s20,
  },
  iconButton: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSpacer: {
    width: SIZE.z44,
    height: SIZE.z44,
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l22,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: FONT_SIZE.f20,
    lineHeight: LINE_HEIGHT.l24,
    fontFamily: FONTS.bold,
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
    paddingTop: SPACE.s12,
    paddingHorizontal: SPACE.s20,
    paddingBottom: SPACE.s16,
    width: '100%',
  },
  avatar: {
    width: SIZE.z88,
    height: SIZE.z88,
    borderRadius: RADIUS.r44,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f28,
    fontFamily: FONTS.bold,
  },
  profileDetails: {
    width: '100%',
    borderRadius: RADIUS.r24,
    borderWidth: BORDER_WIDTH.w1,
    marginTop: SPACE.s16,
    paddingHorizontal: SPACE.s20,
  },
  friendsLink: {
    minHeight: SIZE.z72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bestMetric: {
    minHeight: SIZE.z80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
  },
  detailLabel: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
    marginBottom: SPACE.s3,
  },
  detailTitle: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
  },
  detailChevron: {
    fontSize: FONT_SIZE.f24,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l24,
  },
  bestValue: {
    fontSize: FONT_SIZE.f28,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l28,
  },
  followHint: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginTop: SPACE.s12,
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    gap: SPACE.s12,
    marginTop: SPACE.s16,
  },
  followBtn: {
    flex: 1,
    minHeight: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s9,
  },
  followsYou: {
    textAlign: 'center',
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    marginTop: SPACE.s12,
  },
  followBtnText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
  messageBtn: {
    flex: 1,
    minHeight: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s9,
  },
  messageBtnText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
  workoutsHeading: {
    width: '100%',
    marginTop: SPACE.s24,
    marginBottom: SPACE.s12,
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
    minHeight: SIZE.z44,
    justifyContent: 'center',
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
