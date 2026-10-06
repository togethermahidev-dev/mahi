import React, { useState, useRef, useCallback, useContext, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { haptic } from '@/lib/haptics';
import {
  useChromeStore,
  useFeedStore,
  useProfilePostsStore,
  useSocialStore,
  useUserStore,
} from '@/store';
import { useChromeFade, useTabBarRoom } from '@/hooks/useChrome';
import { useContextMenuPreview } from '@/hooks/useContextMenuPreview';
import { pinchOffset } from '@/lib/viewer';
import { doubleTapLikes, feedLayout } from '@/lib/feedLayout';
import { PressScale, usePop } from '@/components/Motion';
import { ListGestureContext } from '@/components/GestureScrollView';
import { HeartIcon, CommentIcon, MoreIcon } from '@/components/ScreenIcons';
import { startReport } from '@/lib/reportFlow';
import { showNativeMenu } from '@/lib/nativeMenu';
import TaggedBubbleStack from '@/components/TaggedBubbleStack';
import CaptionText from '@/components/CaptionText';
import DraggablePip from '@/components/DraggablePip';
import PostVideo, { SoundButton } from '@/components/PostVideo';
import PreviewMenu, { PostPreviewImage } from '@/components/PreviewMenu';
import EditPostCaptionSheet from '@/components/EditPostCaptionSheet';
import { relativeTime } from '@/lib/relativeTime';
import { pointsBadgeText } from '@/lib/mahiPoints';
import { mediaTypeOrPhoto } from '@/lib/videoPosts';
import {
  isMenuAction,
  menuA11yActions,
  postMenuItems,
  previewSize,
  previewStill,
  shareTarget,
} from '@/lib/contextMenuPreview';
import { sharePost } from '@/lib/sharePost';
import { canEditPostCaption } from '@/lib/postPolicy';
import { appHeaderHeight, pipZone } from '@/lib/pip';
import type { FeedPost } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  DURATION,
  FONT_SIZE,
  ICON_SIZE,
  OFFSET,
  POST_CARD,
  RADIUS,
  SCALE,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  SPRING,
  TRACKING,
  VIEWER,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';

/**
 * One post, full screen (TikTok-style): photo or video, the second shot in a draggable small
 * window, who posted, tags, caption, double-tap and a button to like, a comments button.
 * Press and hold to see the whole photo: everything over it fades away (the glass bar too) until
 * the finger lifts. With hold to preview on (flag context-menu-preview, iPhone, build 11) a hold
 * instead pops the photo out with Like / Unlike, Comment, Share and View profile (owner: it
 * replaces hold to view). Used by the Feed and by the post viewer that opens from a profile grid.
 */
export default function PostCard({
  item,
  dark,
  width,
  height,
  onAvatarPress,
  onCommentPress,
  topSpace = 0,
  playing = false,
  soundOff = true,
  onToggleMuted,
}: {
  item: FeedPost;
  dark: boolean;
  width: number;
  /** Card height: one full screen (TikTok-style snap). */
  height: number;
  onAvatarPress: (userId: string) => void;
  onCommentPress: (postId: string) => void;
  /** Room kept at the top for the feed timer over the first post. */
  topSpace?: number;
  /** Video posts: this card is the one on screen, so its videos play. */
  playing?: boolean;
  /** Video posts: the big video's sound (shared across the feed, muted at first). */
  soundOff?: boolean;
  onToggleMuted?: () => void;
}) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted } = themeColors(dark);
  const border = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a10)
    : withAlpha(COLORS.offBlack, ALPHA.a10);
  // The app header floats over the card; its height follows the status bar / notch.
  const headerH = appHeaderHeight(useSafeAreaInsets().top);
  const cardBg = dark ? COLORS.surfaceDark2 : COLORS.surfaceLight;

  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();
  // The poster's Mahi points after this post (one number per card, so none by the name).
  const points = pointsBadgeText(item.streak_day);
  const reduceMotion = useReducedMotion();

  const [rearIsPrimary, setRearIsPrimary] = useState(true);
  // Whether the primary photo is landscape (wider than tall), detected on load,
  // so a landscape post is letterboxed (contain) rather than center-cropped.
  const [primaryLandscape, setPrimaryLandscape] = useState(false);
  // Slow networks: which photo has arrived or failed, and a retry count that redraws it.
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // ── Store selectors ──────────────────────────────────────────────────────
  const currentUser = useUserStore((s) => s.profile);
  // '…' with Report, on other people's posts only (flag content-reports).
  const reportsOn = true; // reports are standard for everyone (owner, 2026-10-06)
  const canReport = reportsOn && !!currentUser && currentUser.id !== item.user_id;
  const ownPost = !!currentUser && currentUser.id === item.user_id;
  const canEditCaption = ownPost && canEditPostCaption(item.created_at);
  const [editingCaption, setEditingCaption] = useState(false);
  const likedByMe = useSocialStore((s) => s.likedByMe[item.id] ?? item.liked_by_me);
  // Counts move in the feed's copy of the post and the profile grid's (see socialStore).
  const feedCounts = useFeedStore((s) => s.posts.find((p) => p.id === item.id));
  const profileCounts = useProfilePostsStore((s) => s.posts.find((p) => p.id === item.id));
  const likeCount = feedCounts?.like_count ?? profileCounts?.like_count ?? item.like_count;
  const commentCount =
    feedCounts?.comment_count ?? profileCounts?.comment_count ?? item.comment_count;

  // Seed social store on first render
  useEffect(() => {
    useSocialStore.getState().initPost(item.id, item.liked_by_me);
  }, [item.id, item.liked_by_me]);

  // ── Dual-camera pip ──────────────────────────────────────────────────────
  const hasDual = !!item.pov_image_url;
  const primaryUrl = hasDual && !rearIsPrimary ? item.pov_image_url! : item.image_url;
  const pipUrl = hasDual && !rearIsPrimary ? item.image_url : item.pov_image_url;
  // Video posts: either shot can be a video (older posts and servers: photos).
  const rearKind = mediaTypeOrPhoto(item.rear_media_type);
  const frontKind = mediaTypeOrPhoto(item.front_media_type);
  const primaryKind = hasDual && !rearIsPrimary ? frontKind : rearKind;
  const pipKind = hasDual && !rearIsPrimary ? rearKind : frontKind;
  // A video post still uploading says so (its files are large); photo posts show as today.
  const postingVideo = 'isPending' in item && (rearKind === 'video' || frontKind === 'video');

  // ── Draggable PiP (FaceTime-style) — safe zone clears the header + tagged pills ──
  const pipSafeZone = pipZone({ width, height }, headerH + OFFSET.o120 + topSpace);

  // ── Double-tap medal burst animation ─────────────────────────────────────
  const medalScale = useRef(new Animated.Value(0)).current;
  const medalOpacity = useRef(new Animated.Value(0)).current;
  const [medalPos, setMedalPos] = useState({ x: 0, y: 0 });
  const [showMedal, setShowMedal] = useState(false);

  const triggerMedalBurst = useCallback(
    (x: number, y: number) => {
      setMedalPos({ x, y });
      setShowMedal(true);
      // Reduce Motion: the heart fades in and out at full size, no pop.
      if (reduceMotion) {
        medalScale.setValue(1);
        medalOpacity.setValue(0);
        Animated.sequence([
          Animated.timing(medalOpacity, {
            toValue: 1,
            duration: DURATION.d150,
            useNativeDriver: true,
          }),
          Animated.delay(DURATION.d300),
          Animated.timing(medalOpacity, {
            toValue: 0,
            duration: DURATION.d300,
            useNativeDriver: true,
          }),
        ]).start(() => setShowMedal(false));
        return;
      }
      medalScale.setValue(0);
      medalOpacity.setValue(1);

      Animated.sequence([
        Animated.spring(medalScale, {
          toValue: SCALE.s1_3,
          useNativeDriver: true,
          ...SPRING.medal,
        }),
        Animated.timing(medalScale, {
          toValue: 1,
          duration: DURATION.d100,
          useNativeDriver: true,
        }),
        Animated.delay(DURATION.d300),
        Animated.timing(medalOpacity, {
          toValue: 0,
          duration: DURATION.d300,
          useNativeDriver: true,
        }),
      ]).start(() => setShowMedal(false));
    },
    [medalScale, medalOpacity, reduceMotion]
  );

  // A double tap only ever likes. It reads the like from the store at the moment of the tap (the
  // card's copy can be a render behind when someone taps fast), and never sends a second like
  // while the first is on its way — before, two quick double taps liked and then unliked.
  const likeInFlight = useRef(false);
  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      if (!currentUser) return;
      const liked = useSocialStore.getState().likedByMe[item.id] ?? item.liked_by_me;
      if (doubleTapLikes({ liked, pending: likeInFlight.current })) {
        likeInFlight.current = true;
        void useSocialStore
          .getState()
          .toggleLike(item.id, currentUser.id)
          .finally(() => {
            likeInFlight.current = false;
          });
      }
      haptic('tick');
      triggerMedalBurst(x, y);
    },
    [currentUser, item.id, item.liked_by_me, triggerMedalBurst]
  );

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(POST_CARD.doubleTapMs)
    .runOnJS(true)
    .onEnd((e) => {
      handleDoubleTap(e.x, e.y);
    });

  // ── Hold to view ─────────────────────────────────────────────────────────
  // Press and hold (still) → a light tap, and the name, caption, tags, points, buttons and glass
  // bar fade out; lifting brings them back. A finger that moves first is a scroll or a swipe, so
  // the hold never starts; once held, the list can still scroll alongside it.
  const list = useContext(ListGestureContext);
  const chrome = useChromeFade();
  // Apple's tab bar floats over the bottom of the post: the caption block ends above it.
  const tabRoom = useTabBarRoom();
  const holding = useRef(false);
  const startHold = useCallback(() => {
    holding.current = true;
    haptic('pickUp');
    useChromeStore.getState().setViewing(true);
  }, []);
  const endHold = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    useChromeStore.getState().setViewing(false);
  }, []);
  // A card recycled or closed mid-hold brings everything back.
  useEffect(() => endHold, [endHold]);
  const hold = Gesture.LongPress()
    .minDuration(POST_CARD.holdMs)
    .runOnJS(true)
    .onStart(startHold)
    .onFinalize(endHold);
  if (list) hold.simultaneousWithExternalGesture(list);
  // ── Pinch to zoom (founder, 2026-10-05; for everyone, no switch) ─────────
  // Two fingers zoom in on the photo around the point between them; letting go springs it back,
  // as on Instagram. While pinching, everything over the post fades and the list and the page
  // swipes hold still (`chromeStore.zooming`).
  const zoom = useSharedValue(1);
  const zoomX = useSharedValue(0);
  const zoomY = useSharedValue(0);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const mediaH = useSharedValue(height);
  const startZoom = useCallback(() => {
    useChromeStore.getState().setZooming(true);
    useChromeStore.getState().setViewing(true);
  }, []);
  const endZoom = useCallback(() => {
    useChromeStore.getState().setZooming(false);
    if (!holding.current) useChromeStore.getState().setViewing(false);
  }, []);
  // A card recycled or closed mid-pinch lets the pages move again.
  useEffect(() => endZoom, [endZoom]);
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      'worklet';
      pinchStartX.value = e.focalX;
      pinchStartY.value = e.focalY;
      scheduleOnRN(startZoom);
    })
    .onUpdate((e) => {
      'worklet';
      const scale = Math.min(VIEWER.pinchMax, Math.max(VIEWER.zoomMin, e.scale));
      const offset = pinchOffset({
        width,
        height: mediaH.value,
        scale,
        focalX: e.focalX,
        focalY: e.focalY,
        startX: pinchStartX.value,
        startY: pinchStartY.value,
      });
      zoom.value = scale;
      zoomX.value = offset.x;
      zoomY.value = offset.y;
    })
    .onFinalize(() => {
      'worklet';
      zoom.value = withSpring(VIEWER.zoomMin, VIEWER.snapBack);
      zoomX.value = withSpring(0, VIEWER.snapBack);
      zoomY.value = withSpring(0, VIEWER.snapBack);
      scheduleOnRN(endZoom);
    });
  if (list) pinch.simultaneousWithExternalGesture(list);
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: zoomX.value }, { translateY: zoomY.value }, { scale: zoom.value }],
  }));

  // Hold to preview on: Apple's context menu owns the hold, so hold to view steps aside.
  const menuOn = useContextMenuPreview();
  const postGesture = menuOn
    ? Gesture.Simultaneous(doubleTap, pinch)
    : Gesture.Simultaneous(doubleTap, hold, pinch);

  // ── Like handler (action bar tap) ───────────────────────────────────────
  const handleLike = useCallback(() => {
    console.log(
      '[FeedScreen] like button tap post',
      item.id,
      '| likedByMe:',
      likedByMe,
      '| user:',
      currentUser?.id
    );
    if (!currentUser) {
      console.warn('[FeedScreen] like: no currentUser');
      return;
    }
    haptic('tick');
    useSocialStore.getState().toggleLike(item.id, currentUser.id);
  }, [item.id, currentUser, likedByMe]);

  // ── Comment handler ──────────────────────────────────────────────────────
  const handleCommentPress = useCallback(() => {
    onCommentPress(item.id);
  }, [item.id, onCommentPress]);

  // ── Hold to preview (flag context-menu-preview) ──────────────────────────
  const screen = useWindowDimensions();
  // Sizes from the window and the text size: small phones, tall phones and large text.
  const layout = feedLayout(screen);
  // The heart gives a little pop each time it fills.
  const heartPop = usePop(likedByMe);
  const menuItems = menuOn
    ? postMenuItems({ liked: likedByMe, canShare: shareTarget(item) != null })
    : [];
  const runMenuAction = (action: string) => {
    if (!isMenuAction(action)) return;
    if (action === 'like' || action === 'unlike') handleLike();
    else if (action === 'comment') handleCommentPress();
    else if (action === 'share') sharePost(item);
    else if (action === 'view-profile') onAvatarPress(item.profiles.id);
  };
  const previewUri = previewStill([
    { uri: primaryUrl, kind: primaryKind },
    { uri: pipUrl, kind: pipKind },
  ]);

  const media =
    primaryKind === 'video' ? (
      <PostVideo
        uri={primaryUrl}
        playing={playing}
        muted={soundOff}
        style={StyleSheet.absoluteFill}
        accessibilityLabel={`${name}'s video`}
      />
    ) : (
      <Image
        key={`${primaryUrl}#${attempt}`}
        source={{ uri: primaryUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode={primaryLandscape ? 'contain' : 'cover'}
        onError={() => setFailedUri(primaryUrl)}
        onLoad={(e) => {
          setLoadedUri(primaryUrl);
          const src = e.nativeEvent?.source;
          // Landscape (wider than tall) → letterbox; portrait/square stay cover.
          if (src?.width && src?.height) {
            setPrimaryLandscape(src.width / src.height > 1.05);
          }
        }}
      />
    );

  // A photo still on its way shows a spinner on the card; one that failed says so, with a retry.
  // (A locked post has no photo address: nothing to wait for.)
  const photoState =
    primaryKind !== 'photo' || !primaryUrl || loadedUri === primaryUrl
      ? 'shown'
      : failedUri === primaryUrl
        ? 'failed'
        : 'loading';
  const retryPhoto = () => {
    setFailedUri(null);
    setAttempt((n) => n + 1);
  };

  return (
    <View style={[styles.card, { backgroundColor: cardBg, height }]}>
      {/* Post image — double-tap to like, press and hold to see it whole (or, with hold to
          preview on, to pop it out with a menu; off, this wrapper adds nothing) */}
      <View style={[styles.imageContainer, { width, flex: 1 }]}>
        <PreviewMenu
          enabled={menuOn}
          width={width}
          height={height}
          dark={dark}
          items={menuItems}
          onAction={runMenuAction}
          previewSize={previewSize(screen, 'post')}
          previewBackground={cardBg}
          renderPreview={() => <PostPreviewImage uri={previewUri} />}
        >
          <GestureDetector gesture={postGesture}>
            <View
              style={[
                { width, flex: 1 },
                primaryLandscape && primaryKind === 'photo' && styles.letterbox,
              ]}
              onLayout={(e) => {
                mediaH.value = e.nativeEvent.layout.height;
              }}
            >
              <Reanimated.View style={[StyleSheet.absoluteFill, zoomStyle]} pointerEvents="none">
                {menuOn ? null : media}
              </Reanimated.View>
              {menuOn ? (
                // VoiceOver: the post is one element with the menu's choices as actions.
                <View
                  style={StyleSheet.absoluteFill}
                  accessible
                  accessibilityLabel={`${name}'s ${primaryKind}`}
                  accessibilityActions={menuA11yActions(menuItems)}
                  onAccessibilityAction={(e) => runMenuAction(e.nativeEvent.actionName)}
                >
                  {media}
                </View>
              ) : null}
              {photoState === 'loading' ? (
                <View style={[StyleSheet.absoluteFill, styles.photoState]} pointerEvents="none">
                  <ActivityIndicator color={muted} accessibilityLabel="Loading photo" />
                </View>
              ) : photoState === 'failed' ? (
                <View style={[StyleSheet.absoluteFill, styles.photoState]} pointerEvents="box-none">
                  <Text style={[styles.photoStateText, { color: text }]}>
                    Couldn’t load this photo
                  </Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.photoRetry,
                      { borderColor: text },
                      pressed && { opacity: ALPHA.a70 },
                    ]}
                    onPress={retryPhoto}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.photoRetryText, { color: text }]}>Try again</Text>
                  </Pressable>
                </View>
              ) : null}
              {/* Everything over the photo; fades away while the post is held */}
              <Reanimated.View
                style={[StyleSheet.absoluteFill, chrome.style]}
                pointerEvents={chrome.viewing ? 'none' : 'box-none'}
              >
                {/* Top gradient — tagged pills + points badge inline */}
                <LinearGradient
                  colors={[withAlpha(COLORS.black, ALPHA.a60), 'transparent']}
                  style={[styles.postOverlay, { paddingTop: headerH + SPACE.s4 + topSpace }]}
                  pointerEvents="box-none"
                >
                  <View style={styles.taggedColumn} pointerEvents="box-none">
                    {item.tagged_users.length > 0 ? (
                      <Text style={styles.taggedLabel}>Tagged</Text>
                    ) : null}
                    <TaggedBubbleStack
                      users={item.tagged_users}
                      onPressUser={(u) => onAvatarPress(u.user_id)}
                      style={styles.topTaggedPills}
                    />
                  </View>
                  {points || item.response ? (
                    <View style={styles.pointsBadge}>
                      {points ? <Text style={styles.pointsText}>{points}</Text> : null}
                      {/* Who it answered, never how fast: a speed score shames busy people. */}
                      {item.response ? (
                        <Text style={styles.responseText}>
                          Answered @{item.response.tagger_username}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </LinearGradient>
                {/* Bottom shade, full width — behind the profile row, caption and the buttons */}
                <LinearGradient
                  colors={[
                    'transparent',
                    withAlpha(COLORS.black, POST_CARD.shadeMid),
                    withAlpha(COLORS.black, POST_CARD.shadeBottom),
                  ]}
                  style={[
                    styles.captionOverlay,
                    { minHeight: height * layout.shadeHeight },
                    tabRoom > 0 && { paddingBottom: Math.max(SPACE.s80, tabRoom + SPACE.s16) },
                  ]}
                  pointerEvents="box-none"
                >
                  <Pressable
                    style={({ pressed }) => [styles.avatarRow, pressed && { opacity: ALPHA.a75 }]}
                    onPress={() => onAvatarPress(item.profiles.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${name}'s profile`}
                  >
                    {item.profiles.avatar_url ? (
                      <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View
                        style={[
                          styles.avatar,
                          styles.avatarFallback,
                          { backgroundColor: withAlpha(COLORS.white, ALPHA.a30) },
                        ]}
                      >
                        <Text style={styles.avatarInitial}>{initials}</Text>
                      </View>
                    )}
                    <View style={styles.userInfo}>
                      <Text style={styles.usernameOverlay}>{name}</Text>
                      <Text style={styles.timeOverlay}>
                        {postingVideo ? 'Posting…' : relativeTime(item.created_at)}
                      </Text>
                    </View>
                  </Pressable>
                  {item.caption ? (
                    <CaptionText
                      caption={item.caption}
                      tagged={item.tagged_users}
                      style={styles.captionText}
                      onPressUser={(u) => onAvatarPress(u.user_id)}
                      numberOfLines={layout.captionLines}
                    />
                  ) : null}
                </LinearGradient>
              </Reanimated.View>
              {/* Heart burst overlay — shown on double-tap */}
              {showMedal && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.medalBurst,
                    {
                      left: medalPos.x - OFFSET.o40,
                      top: medalPos.y - OFFSET.o40,
                      transform: [{ scale: medalScale }],
                      opacity: medalOpacity,
                    },
                  ]}
                >
                  <HeartIcon size={ICON_SIZE.i80} color={COLORS.white} filled />
                </Animated.View>
              )}
            </View>
          </GestureDetector>
        </PreviewMenu>
        {/* (Tagged pills moved to top gradient row) */}
        {/* Draggable PIP — uses RNGH so it wins over scroll/navigation gestures */}
        {hasDual && pipUrl && (
          <DraggablePip
            uri={pipUrl}
            video={pipKind === 'video'}
            playing={playing}
            zone={pipSafeZone}
            resetKey={item.id}
            onTap={() => setRearIsPrimary((p) => !p)}
          />
        )}

        {/* ── Right-side action column, at the height TikTok and Reels put it ── */}
        {/* Icon SIZE is decoupled from HIT TARGET: glyphs stay small (~32px)
            while each button is a ≥48×48 tappable area + generous hitSlop so
            near-miss taps still register.
            hitSlop is asymmetric (left OFFSET.o4) on purpose: the left edge faces the
            draggable PiP's right-hand snap zone, so we don't extend the hit
            area that way — it grows up/down/right instead. */}
        <Reanimated.View
          style={[styles.sideActions, { bottom: height * layout.actionsBottom }, chrome.style]}
          pointerEvents={chrome.viewing ? 'none' : 'box-none'}
        >
          {primaryKind === 'video' && onToggleMuted ? (
            <SoundButton muted={soundOff} onToggle={onToggleMuted} />
          ) : null}
          <PressScale
            style={styles.sideActionBtn}
            onPress={handleLike}
            hitSlop={{ top: OFFSET.o20, bottom: OFFSET.o20, left: OFFSET.o4, right: OFFSET.o20 }}
            accessibilityRole="button"
            accessibilityLabel={`Like, ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
            accessibilityState={{ selected: likedByMe }}
          >
            <Reanimated.View style={likedByMe ? heartPop : undefined}>
              <HeartIcon size={layout.actionIcon} color={COLORS.white} filled={likedByMe} />
            </Reanimated.View>
            <Text style={styles.sideActionCount}>{likeCount}</Text>
          </PressScale>
          <PressScale
            style={styles.sideActionBtn}
            onPress={handleCommentPress}
            hitSlop={{ top: OFFSET.o20, bottom: OFFSET.o20, left: OFFSET.o4, right: OFFSET.o20 }}
            accessibilityRole="button"
            accessibilityLabel={`Comments, ${commentCount}`}
          >
            <CommentIcon size={layout.actionIcon} color={COLORS.white} />
            <Text style={styles.sideActionCount}>{commentCount}</Text>
          </PressScale>
          {canReport || ownPost ? (
            <Pressable
              style={({ pressed }) => [styles.sideActionBtn, pressed && { opacity: ALPHA.a70 }]}
              onPress={() =>
                ownPost
                  ? showOwnPostMenu(canEditCaption, () => setEditingCaption(true))
                  : showPostMenu(() => startReport('post', item.id))
              }
              hitSlop={{ top: OFFSET.o20, bottom: OFFSET.o20, left: OFFSET.o4, right: OFFSET.o20 }}
              accessibilityRole="button"
              accessibilityLabel="More"
              accessibilityHint={ownPost ? 'Edit caption and see post policy' : 'Report this post'}
            >
              <MoreIcon size={layout.actionIcon} color={COLORS.white} />
            </Pressable>
          ) : null}
        </Reanimated.View>
      </View>
      {editingCaption ? (
        <EditPostCaptionSheet
          postId={item.id}
          caption={item.caption}
          onClose={() => setEditingCaption(false)}
        />
      ) : null}
    </View>
  );
}

/** The post's '…' menu: Report (the only choice for now; more may join it). */
function showPostMenu(onReport: () => void) {
  showNativeMenu({ actions: [{ text: 'Report', destructive: true, run: onReport }] });
}

function showOwnPostMenu(canEdit: boolean, onEdit: () => void) {
  showNativeMenu({
    title: 'Your post',
    message: canEdit
      ? 'You can edit the caption for one hour. Posts can’t be deleted.'
      : 'The one-hour caption editing window has ended. Posts can’t be deleted.',
    actions: canEdit
      ? [{ text: 'Edit caption', run: onEdit }]
      : [{ text: 'Got it', run: () => {} }],
  });
}

const styles = StyleSheet.create({
  // A photo still loading, or one that failed, centred on the card.
  photoState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s12,
    paddingHorizontal: SPACE.s24,
  },
  photoStateText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  photoRetry: {
    minHeight: SIZE.z44,
    paddingHorizontal: SPACE.s20,
    borderRadius: RADIUS.r50,
    borderWidth: BORDER_WIDTH.w1_5,
    justifyContent: 'center',
  },
  photoRetryText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
  },
  card: {
    borderRadius: 0,
    overflow: 'hidden',
  },
  postOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s12,
    paddingBottom: SPACE.s32,
  },
  taggedColumn: {
    flex: 1,
    gap: SPACE.s4,
  },
  taggedLabel: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
  topTaggedPills: {
    position: 'relative',
    left: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.s6,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s10,
  },
  avatar: {
    width: SIZE.z42,
    height: SIZE.z42,
    borderRadius: RADIUS.r21,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
  userInfo: {
    gap: SPACE.s2,
  },
  usernameOverlay: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
    letterSpacing: TRACKING.t1_5,
    color: COLORS.white,
  },
  timeOverlay: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
    color: withAlpha(COLORS.white, ALPHA.a75),
  },
  pointsBadge: {
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s6,
    borderRadius: RADIUS.r50,
    backgroundColor: withAlpha(COLORS.white, ALPHA.a20),
  },
  pointsText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
  responseText: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
    marginTop: SPACE.s2,
  },
  imageContainer: {
    position: 'relative',
  },
  // Black bars behind a letterboxed (contain) landscape photo — standard
  // photo-letterbox color, not a theme surface.
  letterbox: {
    backgroundColor: COLORS.black,
  },
  medalBurst: {
    position: 'absolute',
    width: SIZE.z80,
    height: SIZE.z80,
  },
  // ── Caption overlay (on image): the shade runs edge to edge; the text keeps clear of the
  // like / comment column on the right.
  captionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
    paddingLeft: SPACE.s14,
    paddingRight: SPACE.s80,
    paddingTop: SPACE.s50,
    paddingBottom: SPACE.s80,
    gap: SPACE.s10,
  },
  captionText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.regular,
    color: COLORS.white,
    textShadowColor: withAlpha(COLORS.black, ALPHA.a50),
    textShadowOffset: { width: 0, height: SIZE.z1 },
    textShadowRadius: SHADOW_BLUR.b3,
  },
  // ── Right-side action column (Reels / TikTok style). The shadow follows the icons and counts
  // (the view has no fill), so they read on a light photo.
  sideActions: {
    position: 'absolute',
    right: OFFSET.o12,
    alignItems: 'center',
    gap: SPACE.s20,
    shadowColor: COLORS.black,
    shadowOpacity: POST_CARD.actionsShadow,
    shadowRadius: SHADOW_BLUR.b3,
    shadowOffset: { width: 0, height: SIZE.z1 },
  },
  sideActionBtn: {
    // Hit target ≥48×48 (icon glyph stays ~32px, centered) so taps that
    // land just outside the glyph still register. hitSlop adds up to 20px more
    // on top/bottom/right (left kept tight to avoid the PiP snap zone).
    minWidth: SIZE.z48,
    minHeight: SIZE.z48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s4,
  },
  sideActionCount: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
});
