import React, {
  useState,
  useRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
} from 'react';
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
import { HeartIcon, CommentIcon, MoreIcon, ClockIcon } from '@/components/ScreenIcons';
import { startReport } from '@/lib/reportFlow';
import { showNativeMenu } from '@/lib/nativeMenu';
import CaptionText from '@/components/CaptionText';
import DraggablePip from '@/components/DraggablePip';
import PostVideo, { SoundButton } from '@/components/PostVideo';
import PreviewMenu, { PostPreviewImage } from '@/components/PreviewMenu';
import EditPostCaptionSheet from '@/components/EditPostCaptionSheet';
import { relativeTime } from '@/lib/relativeTime';
import { answerTimingLine, answerTimingTail } from '@/lib/answerTiming';
import { pendingInvites, replyingTo, replyingToText } from '@/lib/postPeople';
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
import { usePostShare } from '@/components/ShareSheet';
import { reportError } from '@/lib/sentry';
import { canEditPostCaption } from '@/lib/postPolicy';
import { deletePost } from '@/api';
import { useToastStore } from '@/store/toastStore';
import {
  appHeaderHeight,
  measuredTextTop,
  pipPlacement,
  sameTextTop,
  textTopFromParts,
  withTextPart,
  type PipMeasure,
  type PipTextParts,
} from '@/lib/pip';
import type { FeedPost } from '@/api';
import { TYPOGRAPHY } from '@/constants/typography';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  DURATION,
  ICON_SIZE,
  OFFSET,
  POST_CARD,
  POST_FULL,
  RADIUS,
  SCALE,
  SHADOW_BLUR,
  SIZE,
  SPACE,
  SPRING,
  VIEWER,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';

/**
 * One post, full screen (TikTok-style): photo or video, the second shot in a draggable small
 * window, who posted, tags, caption, double-tap and a button to like, a comments button.
 * Press and hold to see the whole photo: everything over it fades away (the glass bar too) until
 * the finger lifts. Where hold to preview runs (standard, no switch; iPhone, build 11) a hold
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
  // A full-screen post is a dark canvas in both themes, so what shows while its photo loads (and
  // the first sliver of the next post as you page) is never white (owner, 2026-10-10: "no white
  // bar between the scrolls"). Words on it are the light ones. `dark` still sets the look of the
  // hold-to-preview menu, which follows the theme.
  const text = COLORS.offWhite;
  const { muted } = themeColors(true);
  // The app header floats over the card; its height follows the status bar / notch.
  const headerH = appHeaderHeight(useSafeAreaInsets().top);
  const cardBg = POST_FULL.canvas;

  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();
  // The poster's Mahi points after this post (one number per card, so none by the name).
  const points = pointsBadgeText(item.streak_day);
  // Who this post replies to (core workflow step 21): "Replying to @joe, @sam." with the timing
  // after it, which names no one. A post that replied to no one keeps its line ("First Mahi").
  const replyTo = replyingTo(item);
  const replyLine = replyingToText(replyTo.map((p) => p.username));
  const replyTail = replyLine ? answerTimingTail(item) : null;
  const onTime = replyLine ? null : answerTimingLine(item);
  // Link invites nobody has joined from yet: grey initials circles (core workflow step 13).
  const invites = pendingInvites(item);
  const reduceMotion = useReducedMotion();

  // A list cell is reused for the next post, so what is remembered here says which post (or
  // photo) it is about: the next post never starts swapped, letterboxed or with the small photo
  // where the last one had it.
  // The post whose two shots are swapped (the small one shown big), or null.
  const [swappedPostId, setSwappedPostId] = useState<string | null>(null);
  const rearIsPrimary = swappedPostId !== item.id;
  // The photo found to be landscape (wider than tall) when it loaded, so a landscape post is
  // letterboxed (contain) rather than center-cropped.
  const [landscapeUri, setLandscapeUri] = useState<string | null>(null);
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
  const [deleting, setDeleting] = useState(false);
  // Share: Mahi's share sheet (switch `share-sheet`; off: straight to the phone's).
  const { share, sheet: shareSheet } = usePostShare();

  const removeOwnPost = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    const { error, streak } = await deletePost(item.id);
    setDeleting(false);
    if (error) {
      reportError(error, { flow: 'posts', action: 'deletePost', extra: { postId: item.id } });
      useToastStore.getState().show('Couldn’t delete your post.');
      return;
    }
    useFeedStore.getState().removePost(item.id);
    useProfilePostsStore.getState().removePost(item.id);
    // Deleting takes back the point the post earned (core workflow step 23): the server returns
    // the new points; an older server doesn't, so re-read the profile.
    const me = useUserStore.getState().profile;
    if (streak && me && me.id === item.user_id) {
      useUserStore.getState().setProfile({ ...me, ...streak });
    } else if (item.user_id) {
      void useUserStore.getState().refresh(item.user_id);
    }
    useToastStore.getState().show('Post deleted.');
  }, [deleting, item.id, item.user_id]);
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
  const primaryLandscape = landscapeUri === primaryUrl;
  // A video post still uploading says so (its files are large); photo posts show as today.
  const postingVideo = 'isPending' in item && (rearKind === 'video' || frontKind === 'video');

  // ── Draggable PiP (FaceTime-style) — safe zone clears the header + tagged pills ──
  // …and never covers the name row, the line under it or the caption (owner, 2026-10-10: "make
  // sure it never does on all posts"; rules in src/lib/pip.ts). Its lowest spot comes from where
  // THIS post's name row starts; until that is known for this post, it isn't drawn.
  const postId = item.id;
  const mediaRef = useRef<View>(null);
  const nameRowRef = useRef<View>(null);
  const [pipMeasure, setPipMeasure] = useState<PipMeasure | null>(null);
  const noteTextTop = useCallback((id: string, textTop: number) => {
    setPipMeasure((known) => (sameTextTop(known, id, textTop) ? known : { postId: id, textTop }));
  }, []);
  // Measured as soon as each draw of the post is laid out, before it is shown, so the small photo
  // and the text under it land on the same frame.
  useLayoutEffect(() => {
    const row = nameRowRef.current;
    const media = mediaRef.current;
    if (!hasDual || !row || !media) return;
    row.measureLayout(media, (_x, y) => noteTextTop(postId, y));
  });
  // The same answer from the layout reports (the shade's top on the post plus the name row's top
  // in the shade), in case the measure above has nothing to say. The text block is made fresh
  // for each post (its key), so these are always this post's own.
  const textParts = useRef<PipTextParts>({ postId, shadeY: null, rowY: null });
  const noteTextPart = (part: 'shadeY' | 'rowY', y: number) => {
    if (!hasDual) return;
    textParts.current = withTextPart(textParts.current, postId, part, y);
    const textTop = textTopFromParts(textParts.current, postId);
    if (textTop != null) noteTextTop(postId, textTop);
  };
  const pip =
    hasDual && pipUrl
      ? pipPlacement(
          { width, height },
          headerH + OFFSET.o120 + topSpace,
          headerH + topSpace,
          measuredTextTop(pipMeasure, postId)
        )
      : null;

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
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: zoomX.value }, { translateY: zoomY.value }, { scale: zoom.value }],
  }));

  // Hold to preview on: Apple's context menu owns the hold, so hold to view steps aside.
  const menuOn = useContextMenuPreview();
  const postGesture = menuOn ? doubleTap : Gesture.Simultaneous(doubleTap, hold);
  // The pinch has its own detector, on a plain view around the hold-to-preview host (the same
  // side of it as the list's own scrolling), and runs alongside the post's gestures inside the
  // host and alongside the list, exactly as it did when it was one of them.
  pinch.simultaneousWithExternalGesture(doubleTap);
  if (!menuOn) pinch.simultaneousWithExternalGesture(hold);
  if (list) pinch.simultaneousWithExternalGesture(list);

  // ── Like handler (action bar tap) ───────────────────────────────────────
  const handleLike = useCallback(() => {
    if (!currentUser) {
      return;
    }
    haptic('tick');
    useSocialStore.getState().toggleLike(item.id, currentUser.id);
  }, [item.id, currentUser, likedByMe]);

  // ── Comment handler ──────────────────────────────────────────────────────
  const handleCommentPress = useCallback(() => {
    onCommentPress(item.id);
  }, [item.id, onCommentPress]);

  // ── Hold to preview (standard, no switch) ────────────────────────────────
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
    else if (action === 'share') share(item);
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
        source={{ uri: primaryUrl, cache: 'force-cache' }}
        style={StyleSheet.absoluteFill}
        resizeMode={primaryLandscape ? 'contain' : 'cover'}
        onError={() => setFailedUri(primaryUrl)}
        onLoad={(e) => {
          setLoadedUri(primaryUrl);
          const src = e.nativeEvent?.source;
          // Landscape (wider than tall) → letterbox; portrait/square stay cover.
          if (src?.width && src?.height) {
            setLandscapeUri(src.width / src.height > 1.05 ? primaryUrl : null);
          }
        }}
      />
    );
  // The photo (or video) inside the view the pinch moves: the one you pinch is the one you see,
  // with hold to preview on or off. (It was drawn outside this view wherever hold to preview
  // runs, so a pinch there zoomed nothing.)
  const zoomedMedia = (
    <Reanimated.View style={[StyleSheet.absoluteFill, zoomStyle]} pointerEvents="none">
      {media}
    </Reanimated.View>
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
        {/* Two fingers zoom the photo. The pinch is taken here, on a plain view around the
            hold-to-preview host, where the list's own scrolling is taken too. */}
        <GestureDetector gesture={pinch}>
          <View style={{ width, flex: 1 }}>
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
                  ref={mediaRef}
                  style={[
                    { width, flex: 1 },
                    primaryLandscape && primaryKind === 'photo' && styles.letterbox,
                  ]}
                  onLayout={(e) => {
                    mediaH.value = e.nativeEvent.layout.height;
                  }}
                >
                  {menuOn ? (
                    // VoiceOver: the post is one element with the menu's choices as actions.
                    <View
                      style={StyleSheet.absoluteFill}
                      accessible
                      accessibilityLabel={`${name}'s ${primaryKind}`}
                      accessibilityActions={menuA11yActions(menuItems)}
                      onAccessibilityAction={(e) => runMenuAction(e.nativeEvent.actionName)}
                    >
                      {zoomedMedia}
                    </View>
                  ) : (
                    zoomedMedia
                  )}
                  {photoState === 'loading' ? (
                    <View style={[StyleSheet.absoluteFill, styles.photoState]} pointerEvents="none">
                      <ActivityIndicator color={muted} accessibilityLabel="Loading photo" />
                    </View>
                  ) : photoState === 'failed' ? (
                    <View
                      style={[StyleSheet.absoluteFill, styles.photoState]}
                      pointerEvents="box-none"
                    >
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
                  {/* One information layer over the photo; fades away while the post is held. */}
                  <Reanimated.View
                    style={[StyleSheet.absoluteFill, chrome.style]}
                    pointerEvents={chrome.viewing ? 'none' : 'box-none'}
                  >
                    {/* A single bottom shade keeps controls legible without masking the workout.
                    Made fresh for each post (the key), so where its name row starts is always
                    reported for this post, even in a reused list cell. */}
                    <LinearGradient
                      key={postId}
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
                      onLayout={(e) => noteTextPart('shadeY', e.nativeEvent.layout.y)}
                    >
                      <View
                        ref={nameRowRef}
                        style={styles.identityRow}
                        onLayout={(e) => noteTextPart('rowY', e.nativeEvent.layout.y)}
                      >
                        <PressScale
                          style={styles.avatarRow}
                          onPress={() => onAvatarPress(item.profiles.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${name}'s profile`}
                        >
                          {item.profiles.avatar_url ? (
                            <Image
                              source={{ uri: item.profiles.avatar_url, cache: 'force-cache' }}
                              style={styles.avatar}
                            />
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
                            {replyLine ? (
                              <View style={styles.onTimeRow}>
                                <ClockIcon size={ICON_SIZE.i14} color={COLORS.accent} />
                                <Text
                                  style={[styles.timeOverlay, styles.onTimeText]}
                                  numberOfLines={2}
                                  accessibilityLabel={[replyLine, replyTail]
                                    .filter(Boolean)
                                    .join(' ')}
                                >
                                  Replying to{' '}
                                  {replyTo.map((person, index) => (
                                    <Text
                                      key={person.user_id ?? person.username}
                                      style={person.user_id ? styles.replyPerson : undefined}
                                      onPress={
                                        person.user_id
                                          ? () => onAvatarPress(person.user_id as string)
                                          : undefined
                                      }
                                      accessibilityRole={person.user_id ? 'link' : undefined}
                                    >
                                      @{person.username}
                                      {index < replyTo.length - 1 ? ', ' : '.'}
                                    </Text>
                                  ))}
                                  {replyTail ? ` ${replyTail}` : ''}
                                </Text>
                              </View>
                            ) : null}
                            {onTime ? (
                              <View style={styles.onTimeRow}>
                                <ClockIcon size={ICON_SIZE.i14} color={COLORS.accent} />
                                <Text
                                  style={[styles.timeOverlay, styles.onTimeText]}
                                  numberOfLines={1}
                                >
                                  {onTime}
                                </Text>
                              </View>
                            ) : null}
                            <Text style={styles.timeOverlay} numberOfLines={1}>
                              {postingVideo ? 'Posting…' : relativeTime(item.created_at)}
                              {points ? ` · ${points}` : ''}
                            </Text>
                          </View>
                        </PressScale>
                        {canReport || ownPost ? (
                          <PressScale
                            style={styles.moreButton}
                            onPress={() =>
                              ownPost
                                ? showOwnPostMenu(
                                    canEditCaption,
                                    () => setEditingCaption(true),
                                    removeOwnPost,
                                    deleting
                                  )
                                : showPostMenu(() => startReport('post', item.id))
                            }
                            hitSlop={OFFSET.o12}
                            accessibilityRole="button"
                            accessibilityLabel="More"
                            accessibilityHint={
                              ownPost ? 'Edit caption or delete this post' : 'Report this post'
                            }
                          >
                            <MoreIcon size={ICON_SIZE.i20} color={COLORS.white} />
                          </PressScale>
                        ) : null}
                      </View>
                      {item.caption ? (
                        <CaptionText
                          caption={item.caption}
                          tagged={item.tagged_users}
                          style={styles.captionText}
                          onPressUser={(u) => onAvatarPress(u.user_id)}
                          numberOfLines={layout.captionLines}
                        />
                      ) : null}
                      {item.tagged_users.length > 0 || invites.length > 0 ? (
                        <View style={styles.taggedRow}>
                          <Text style={styles.taggedText} numberOfLines={1}>
                            With{' '}
                            {item.tagged_users.map((user, index) => (
                              <Text
                                key={user.user_id}
                                style={styles.taggedPerson}
                                onPress={() => onAvatarPress(user.user_id)}
                                accessibilityRole="link"
                              >
                                @{user.username}
                                {index < item.tagged_users.length - 1 ? ', ' : ''}
                              </Text>
                            ))}
                          </Text>
                          {/* Invited by link, not joined yet: initials only, never a name or number.
                          The real avatar and username replace it once they join. */}
                          {invites.map((invite) => (
                            <View
                              key={invite.key}
                              style={styles.invitedChip}
                              accessible
                              accessibilityLabel={
                                invite.initials ? `Invited, ${invite.initials}` : 'Invited'
                              }
                            >
                              <View style={styles.invitedCircle}>
                                {invite.initials ? (
                                  <Text style={styles.invitedInitials}>{invite.initials}</Text>
                                ) : null}
                              </View>
                              <Text style={styles.taggedText}>Invited ⏳</Text>
                            </View>
                          ))}
                        </View>
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
          </View>
        </GestureDetector>
        {/* Draggable PIP — uses RNGH so it wins over scroll/navigation gestures. One per post
            (the key: never where the last post left it), drawn only once this post's name row
            has been measured, inside a fence that ends above that row. */}
        {pip && pipUrl ? (
          <DraggablePip
            key={postId}
            uri={pipUrl}
            video={pipKind === 'video'}
            playing={playing}
            zone={pip.zone}
            fence={pip.fence}
            onTap={() => setSwappedPostId((id) => (id === postId ? null : postId))}
          />
        ) : null}

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
        </Reanimated.View>
      </View>
      {editingCaption ? (
        <EditPostCaptionSheet
          postId={item.id}
          caption={item.caption}
          onClose={() => setEditingCaption(false)}
        />
      ) : null}
      {shareSheet}
    </View>
  );
}

/** The post's '…' menu: Report (the only choice for now; more may join it). */
function showPostMenu(onReport: () => void) {
  showNativeMenu({ actions: [{ text: 'Report', destructive: true, run: onReport }] });
}

function showOwnPostMenu(
  canEdit: boolean,
  onEdit: () => void,
  onDelete: () => void,
  deleting: boolean
) {
  const confirmDelete = () =>
    showNativeMenu({
      title: 'Delete post?',
      message: 'Deleting removes the point it earned. This can’t be undone.',
      actions: [{ text: 'Delete post', destructive: true, run: onDelete }],
    });
  showNativeMenu({
    title: 'Your post',
    message: canEdit ? 'You can edit the caption for one hour.' : undefined,
    actions: [
      ...(canEdit ? [{ text: 'Edit caption', run: onEdit }] : []),
      {
        text: deleting ? 'Deleting…' : 'Delete post',
        destructive: true,
        run: deleting ? () => {} : confirmDelete,
      },
    ],
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
    ...TYPOGRAPHY.body,
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
    ...TYPOGRAPHY.pillLabel,
  },
  card: {
    borderRadius: 0,
    overflow: 'hidden',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarRow: {
    flex: 1,
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
    ...TYPOGRAPHY.h4,
    color: COLORS.white,
  },
  userInfo: {
    flex: 1,
    gap: SPACE.s2,
  },
  usernameOverlay: {
    ...TYPOGRAPHY.h4,
    color: COLORS.white,
  },
  /** The on-time line: "Answered @sam in 2h", a small accent clock in front. */
  onTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s4,
  },
  onTimeText: {
    flexShrink: 1,
  },
  timeOverlay: {
    ...TYPOGRAPHY.small,
    color: withAlpha(COLORS.white, ALPHA.a75),
  },
  moreButton: {
    width: SIZE.z44,
    height: SIZE.z44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taggedText: {
    ...TYPOGRAPHY.small,
    color: withAlpha(COLORS.white, ALPHA.a75),
  },
  taggedPerson: {
    ...TYPOGRAPHY.labelStrong,
    color: COLORS.white,
  },
  /** A name in "Replying to @joe, @sam." that opens their profile. */
  replyPerson: {
    ...TYPOGRAPHY.labelStrong,
    color: COLORS.white,
  },
  /** "With @a, @b" then each pending invite, wrapping onto a second line when it must. */
  taggedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: SPACE.s10,
    rowGap: SPACE.s6,
  },
  invitedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
  },
  /** The grey circle for a mate invited by link: the same see-through white as a photo-less
   *  avatar, so it reads as "no picture yet". */
  invitedCircle: {
    width: SIZE.z24,
    height: SIZE.z24,
    borderRadius: RADIUS.pill,
    backgroundColor: withAlpha(COLORS.white, ALPHA.a30),
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitedInitials: {
    ...TYPOGRAPHY.microStrong,
    color: COLORS.white,
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
    ...TYPOGRAPHY.postBody,
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
    ...TYPOGRAPHY.label,
    color: COLORS.white,
  },
});
