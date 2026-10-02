import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  createContext,
  forwardRef,
  useContext,
} from 'react';
import {
  View,
  Text,
  Image,
  RefreshControl,
  StyleSheet,
  Animated,
  Pressable,
  useWindowDimensions,
  TextInput,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture, type NativeGesture } from 'react-native-gesture-handler';
import { useAnimatedRef, useScrollOffset, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeed } from '@/hooks/useFeed';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useOpenTags } from '@/hooks/useOpenTags';
import { answersATag } from '@/lib/reactivePosting';
import FeedLockBanner from '@/components/FeedLockBanner';
import { useFeedStore, useSocialStore, useUserStore, useAuthStore } from '@/store';
import { LikeIcon, HeartIcon, CommentIcon } from '@/components/ScreenIcons';
import UserProfileScreen from '@/screens/UserProfileScreen';
import TaggedBubbleStack from '@/components/TaggedBubbleStack';
import CaptionText from '@/components/CaptionText';
import { formatWait } from '@/lib/countdown';
import { streakText } from '@/lib/streakText';
import { lockedPostText } from '@/lib/feedLock';
import PointsBadge from '@/components/PointsBadge';
import KeyboardInset from '@/components/KeyboardInset';
import DraggablePip from '@/components/DraggablePip';
import { appHeaderHeight, pipZone } from '@/lib/pip';
import { atListTop } from '@/lib/swipeRules';
import type { FeedPost } from '@/api';
import type { CommentWithProfile } from '@/api/social';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  SPACE,
  RADIUS,
  BORDER_WIDTH,
  ICON_SIZE,
  OFFSET,
  SIZE,
  TRACKING,
} from '@/constants/tokens';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1_000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── CommentRow ──────────────────────────────────────────────────────────────

function CommentRow({ comment, dark }: { comment: CommentWithProfile; dark: boolean }) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const name = comment.profiles.display_name ?? comment.profiles.username;
  const initials = (comment.profiles.username ?? '?')[0].toUpperCase();

  return (
    <View style={styles.commentRow}>
      {comment.profiles.avatar_url ? (
        <Image source={{ uri: comment.profiles.avatar_url }} style={styles.commentAvatar} />
      ) : (
        <View style={[styles.commentAvatar, styles.avatarFallback, { backgroundColor: muted }]}>
          <Text style={[styles.commentAvatarInitial, { color: text }]}>{initials}</Text>
        </View>
      )}
      <View style={styles.commentBody}>
        <Text style={[styles.commentUsername, { color: text }]}>{name}</Text>
        <Text style={[styles.commentText, { color: text }]}>{comment.content}</Text>
      </View>
      <Text style={[styles.commentTime, { color: muted }]}>{relativeTime(comment.created_at)}</Text>
    </View>
  );
}

// ─── LockedPostItem ──────────────────────────────────────────────────────────

/** A friend's post while the viewer's feed is locked: who and when, no photo or caption. */
function LockedPostItem({
  item,
  height,
  text,
  onAvatarPress,
  onUnlockPress,
  topSpace = 0,
}: {
  item: FeedPost;
  /** What to say, and a button only when the viewer can post. */
  text: { hint: string; button?: string };
  /** Card height: one full screen (TikTok-style snap). */
  height: number;
  onAvatarPress: (userId: string) => void;
  onUnlockPress: () => void;
  /** Room kept at the top for the lock card over the first post. */
  topSpace?: number;
}) {
  const { colors } = useAppTheme();
  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();
  const streak = streakText(item.streak_day);
  return (
    <View
      style={[
        styles.lockedCard,
        { backgroundColor: colors.offBlack, height, paddingTop: topSpace },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.lockedWho, pressed && { opacity: 0.75 }]}
        onPress={() => onAvatarPress(item.profiles.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s profile`}
      >
        {item.profiles.avatar_url ? (
          <Image source={{ uri: item.profiles.avatar_url }} style={styles.lockedAvatar} />
        ) : (
          <View
            style={[styles.lockedAvatar, styles.avatarFallback, { borderColor: colors.accent }]}
          >
            <Text style={[styles.avatarInitial, { color: colors.offWhite }]}>{initials}</Text>
          </View>
        )}
        <Text style={[styles.lockedName, { color: colors.offWhite }]}>{name}</Text>
        <Text style={[styles.lockedTime, { color: colors.offWhite }]}>
          posted {relativeTime(item.created_at)}
          {streak ? ` · ${streak}` : ''}
        </Text>
      </Pressable>
      <Text style={[styles.lockedHint, { color: colors.offWhite }]}>{text.hint}</Text>
      {text.button ? (
        <Pressable
          style={({ pressed }) => [
            styles.lockedButton,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.85 },
          ]}
          onPress={onUnlockPress}
          accessibilityRole="button"
          accessibilityLabel={text.button}
        >
          <Text style={[styles.lockedButtonText, { color: colors.offBlack }]}>{text.button}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── PostItem ────────────────────────────────────────────────────────────────

function PostItem({
  item,
  dark,
  width,
  height,
  onAvatarPress,
  onCommentPress,
  topSpace = 0,
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
}) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.1) : withAlpha(COLORS.offBlack, 0.1);
  // The app header floats over the card; its height follows the status bar / notch.
  const headerH = appHeaderHeight(useSafeAreaInsets().top);
  const cardBg = dark ? COLORS.surfaceDark2 : COLORS.surfaceLight;

  const name = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();
  const streak = streakText(item.streak_day);

  const [rearIsPrimary, setRearIsPrimary] = useState(true);
  // Whether the primary photo is landscape (wider than tall), detected on load,
  // so a landscape post is letterboxed (contain) rather than center-cropped.
  const [primaryLandscape, setPrimaryLandscape] = useState(false);

  // ── Store selectors ──────────────────────────────────────────────────────
  const currentUser = useUserStore((s) => s.profile);
  const likedByMe = useSocialStore((s) => s.likedByMe[item.id] ?? item.liked_by_me);
  const likeCount = useFeedStore((s) => {
    const p = s.posts.find((p) => p.id === item.id);
    return p?.like_count ?? item.like_count;
  });
  const commentCount = useFeedStore((s) => {
    const p = s.posts.find((p) => p.id === item.id);
    return p?.comment_count ?? item.comment_count;
  });

  // Seed social store on first render
  useEffect(() => {
    useSocialStore.getState().initPost(item.id, item.liked_by_me);
  }, [item.id, item.liked_by_me]);

  // ── Dual-camera pip ──────────────────────────────────────────────────────
  const hasDual = !!item.pov_image_url;
  const primaryUrl = hasDual && !rearIsPrimary ? item.pov_image_url! : item.image_url;
  const pipUrl = hasDual && !rearIsPrimary ? item.image_url : item.pov_image_url;

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
      medalScale.setValue(0);
      medalOpacity.setValue(1);

      Animated.sequence([
        Animated.spring(medalScale, {
          toValue: 1.3,
          useNativeDriver: true,
          speed: 30,
          bounciness: 8,
        }),
        Animated.timing(medalScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.delay(300),
        Animated.timing(medalOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setShowMedal(false));
    },
    [medalScale, medalOpacity]
  );

  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      console.log(
        '[FeedScreen] double-tap post',
        item.id,
        '| likedByMe:',
        likedByMe,
        '| user:',
        currentUser?.id
      );
      if (!currentUser) {
        console.warn('[FeedScreen] double-tap: no currentUser');
        return;
      }
      if (!likedByMe) {
        console.log('[FeedScreen] double-tap → toggleLike (like)');
        useSocialStore.getState().toggleLike(item.id, currentUser.id);
      } else {
        console.log('[FeedScreen] double-tap → already liked, skipping');
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      triggerMedalBurst(x, y);
    },
    [currentUser, likedByMe, item.id, triggerMedalBurst]
  );

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd((e) => {
      handleDoubleTap(e.x, e.y);
    });

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useSocialStore.getState().toggleLike(item.id, currentUser.id);
  }, [item.id, currentUser, likedByMe]);

  // ── Comment handler ──────────────────────────────────────────────────────
  const handleCommentPress = useCallback(() => {
    onCommentPress(item.id);
  }, [item.id, onCommentPress]);

  return (
    <View style={[styles.card, { backgroundColor: cardBg, height }]}>
      {/* Post image — double-tap to like */}
      <View style={[styles.imageContainer, { width, flex: 1 }]}>
        <GestureDetector gesture={doubleTap}>
          <View style={[{ width, flex: 1 }, primaryLandscape && styles.letterbox]}>
            <Image
              source={{ uri: primaryUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode={primaryLandscape ? 'contain' : 'cover'}
              onLoad={(e) => {
                const src = e.nativeEvent?.source;
                // Landscape (wider than tall) → letterbox; portrait/square stay cover.
                if (src?.width && src?.height) {
                  setPrimaryLandscape(src.width / src.height > 1.05);
                }
              }}
            />
            {/* Top gradient — tagged pills + streak badge inline */}
            <LinearGradient
              colors={[withAlpha(COLORS.black, 0.6), 'transparent']}
              style={[styles.postOverlay, { paddingTop: headerH + SPACE.s4 + topSpace }]}
              pointerEvents="box-none"
            >
              <TaggedBubbleStack
                users={item.tagged_users}
                onPressUser={(u) => onAvatarPress(u.user_id)}
                style={styles.topTaggedPills}
              />
              {streak || item.response ? (
                <View style={styles.streakBadge}>
                  {streak ? <Text style={styles.streakText}>{streak}</Text> : null}
                  {item.response ? (
                    <Text style={styles.responseText}>
                      Answered @{item.response.tagger_username} in{' '}
                      {formatWait(item.response.seconds)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </LinearGradient>
            {/* Bottom gradient — profile row + caption */}
            <LinearGradient
              colors={['transparent', withAlpha(COLORS.black, 0.7)]}
              style={styles.captionOverlay}
              pointerEvents="box-none"
            >
              <Pressable
                style={({ pressed }) => [styles.avatarRow, pressed && { opacity: 0.75 }]}
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
                      { backgroundColor: withAlpha(COLORS.white, 0.3) },
                    ]}
                  >
                    <Text style={styles.avatarInitial}>{initials}</Text>
                  </View>
                )}
                <View style={styles.userInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.usernameOverlay}>{name}</Text>
                    <PointsBadge points={item.profiles.points} style={styles.pointsOverlay} />
                  </View>
                  <Text style={styles.timeOverlay}>{relativeTime(item.created_at)}</Text>
                </View>
              </Pressable>
              {item.caption ? (
                <CaptionText
                  caption={item.caption}
                  tagged={item.tagged_users}
                  style={styles.captionText}
                  onPressUser={(u) => onAvatarPress(u.user_id)}
                  numberOfLines={2}
                />
              ) : null}
            </LinearGradient>
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
        {/* (Tagged pills moved to top gradient row) */}
        {/* Draggable PIP — uses RNGH so it wins over scroll/navigation gestures */}
        {hasDual && pipUrl && (
          <DraggablePip
            uri={pipUrl}
            zone={pipSafeZone}
            resetKey={item.id}
            onTap={() => setRearIsPrimary((p) => !p)}
          />
        )}

        {/* ── Right-side action column (Reels / TikTok style) ── */}
        {/* Icon SIZE is decoupled from HIT TARGET: glyphs stay small (~32px)
            while each button is a ≥48×48 tappable area + generous hitSlop so
            near-miss taps still register. Column raised (bottom OFFSET.o140) so the
            buttons sit higher and clear of the caption row.
            hitSlop is asymmetric (left OFFSET.o4) on purpose: the left edge faces the
            draggable PiP's bottom-right snap zone, so we don't extend the hit
            area that way — it grows up/down/right instead. */}
        <View style={styles.sideActions} pointerEvents="box-none">
          <Pressable
            style={({ pressed }) => [styles.sideActionBtn, pressed && { opacity: 0.7 }]}
            onPress={handleLike}
            hitSlop={{ top: OFFSET.o20, bottom: OFFSET.o20, left: OFFSET.o4, right: OFFSET.o20 }}
            accessibilityRole="button"
            accessibilityLabel={`Like, ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
            accessibilityState={{ selected: likedByMe }}
          >
            <HeartIcon size={ICON_SIZE.i32} color={COLORS.white} filled={likedByMe} />
            <Text style={styles.sideActionCount}>{likeCount}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.sideActionBtn, pressed && { opacity: 0.7 }]}
            onPress={handleCommentPress}
            hitSlop={{ top: OFFSET.o20, bottom: OFFSET.o20, left: OFFSET.o4, right: OFFSET.o20 }}
            accessibilityRole="button"
            accessibilityLabel={`Comments, ${commentCount}`}
          >
            <CommentIcon size={ICON_SIZE.i32} color={COLORS.white} />
            <Text style={styles.sideActionCount}>{commentCount}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── CommentSheet (native page sheet) ───────────────────────────────────────

/** Comments for one post in a native iOS page sheet; swipe down or Android back closes it. */
function CommentSheet({
  postId,
  dark,
  onClose,
}: {
  /** The post whose comments to show; null keeps the sheet closed. */
  postId: string | null;
  dark: boolean;
  onClose: () => void;
}) {
  const sheetBg = dark ? COLORS.surfaceDark2 : COLORS.surfaceLight;
  // Keep the last post's comments on screen while the sheet slides away.
  const [shownId, setShownId] = useState(postId);
  if (postId && postId !== shownId) setShownId(postId);

  return (
    <Modal
      visible={!!postId}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own provider: the sheet's insets differ from the screen behind it. */}
      <SafeAreaProvider>
        <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
          {shownId ? <CommentThread key={shownId} postId={shownId} dark={dark} /> : null}
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

function CommentThread({ postId, dark }: { postId: string; dark: boolean }) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.1) : withAlpha(COLORS.offBlack, 0.1);

  const [commentText, setCommentText] = useState('');
  const insets = useSafeAreaInsets();
  // The keyboard covers the home-indicator strip, so that inset only applies while it is closed.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardOpen(true)
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardOpen(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const currentUser = useUserStore((s) => s.profile);
  const comments = useSocialStore((s) => s.comments[postId]);
  const commentCount = useFeedStore((s) => {
    const p = s.posts.find((p) => p.id === postId);
    return p?.comment_count ?? 0;
  });

  useEffect(() => {
    useSocialStore.getState().loadComments(postId);
  }, [postId]);

  const handleSubmitComment = useCallback(() => {
    const trimmed = commentText.trim();
    if (!trimmed || !currentUser) return;
    useSocialStore.getState().addComment(postId, currentUser.id, trimmed, {
      id: currentUser.id,
      username: currentUser.username,
      display_name: currentUser.display_name ?? null,
      avatar_url: currentUser.avatar_url ?? null,
    });
    setCommentText('');
    Keyboard.dismiss();
  }, [commentText, postId, currentUser]);

  return (
    <>
      <Text style={[styles.sheetTitle, { color: text }]} accessibilityRole="header">
        {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
      </Text>

      {/* Comment list */}
      <View style={styles.sheetList}>
        {comments && comments.length > 0 ? (
          <FlashList
            data={comments}
            keyExtractor={(c) => c.id}
            renderItem={({ item: comment }) => <CommentRow comment={comment} dark={dark} />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          />
        ) : (
          <View style={styles.sheetEmpty}>
            <Text style={[styles.sheetEmptyText, { color: muted }]}>No comments yet</Text>
          </View>
        )}
      </View>

      {/* Comment input — KeyboardInset below keeps it just above the keyboard */}
      <View
        style={[
          styles.commentInputRow,
          {
            borderTopColor: border,
            paddingBottom: keyboardOpen ? SPACE.s10 : Math.max(insets.bottom, SPACE.s10),
          },
        ]}
      >
        <TextInput
          style={[styles.commentInput, { color: text, borderColor: border }]}
          placeholder="Add a comment…"
          placeholderTextColor={muted}
          value={commentText}
          onChangeText={setCommentText}
          returnKeyType="send"
          onSubmitEditing={handleSubmitComment}
          autoCapitalize="sentences"
          enablesReturnKeyAutomatically
          autoFocus
        />
        <Pressable
          style={({ pressed }) => [
            styles.commentSubmit,
            { backgroundColor: COLORS.accent },
            pressed && { opacity: 0.75 },
          ]}
          onPress={handleSubmitComment}
          accessibilityRole="button"
          accessibilityLabel="Send comment"
        >
          <Text style={styles.commentSubmitText}>Send</Text>
        </Pressable>
      </View>
      <KeyboardInset />
    </>
  );
}

// ─── FeedScreen ──────────────────────────────────────────────────────────────

interface FeedScreenProps {
  /** Take the user to the camera (used by locked posts). */
  onGoToCamera?: () => void;
  /** Open people search (the empty feed's "Find friends" button). */
  onFindFriends?: () => void;
  headerAnim?: Animated.Value;
  onOverlayChange?: (active: boolean) => void;
  /** The list's scrolling as a gesture, so the Camera ↕ Feed swipe can run alongside it. */
  listGesture?: NativeGesture;
  /** How far the list is scrolled, kept up to date on the UI thread for the Camera ↕ Feed swipe. */
  listOffset?: SharedValue<number>;
}

/** Lends the list's scrolling to the Camera ↕ Feed swipe (see FeedScrollView). */
const ListGestureContext = createContext<NativeGesture | undefined>(undefined);

/** The feed list's scroll view, wrapped so its scrolling is a gesture the swipe can work with. */
const FeedScrollView = forwardRef<ScrollView, ScrollViewProps>(function FeedScrollView(props, ref) {
  const gesture = useContext(ListGestureContext);
  const list = <ScrollView {...props} ref={ref} />;
  return gesture ? <GestureDetector gesture={gesture}>{list}</GestureDetector> : list;
});

export default function FeedScreen({
  onGoToCamera,
  onFindFriends,
  headerAnim,
  onOverlayChange,
  listGesture,
  listOffset,
}: FeedScreenProps = {}): React.JSX.Element {
  const { dark } = useAppTheme();
  const headerH = appHeaderHeight(useSafeAreaInsets().top);
  // TikTok-style snap: each card fills the full screen height.
  const { width: screenWidth, height: cardHeight } = useWindowDimensions();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);

  const {
    posts,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
    locked,
    unlockedUntil,
    serverOffsetMs,
    loaded,
  } = useFeed();

  // Lock card / feed timer under the header. It floats over the first post (a list header would
  // knock the full-screen snapping out of step), so the first post keeps room for it.
  const lockExplainer = useFeatureFlag('feed-lock-explainer');
  const [bannerH, setBannerH] = useState(0);
  const topSpace = lockExplainer && bannerH > 0 ? bannerH + SPACE.s8 : 0;

  // Friends' posts while locked: a button only when reactive posting lets you post (a tag still
  // open on the server clock, or your first post).
  const tagged = answersATag(useOpenTags().openTags, serverOffsetMs);
  const postedBefore = unlockedUntil !== null;
  const lockedText = useMemo(
    () => lockedPostText({ tagged, postedBefore }),
    [tagged, postedBefore]
  );
  const listExtra = useMemo(() => ({ topSpace, lockedText }), [topSpace, lockedText]);

  // Profile overlay, conversation overlay, and comment sheet — lifted to
  // FeedScreen so overlays cover the full screen (not just the PostItem card)
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Notify parent when a fullscreen overlay (profile) opens/closes
  const feedOverlay = !!profileUserId;
  const prevFeedOverlay = useRef(false);
  if (feedOverlay !== prevFeedOverlay.current) {
    prevFeedOverlay.current = feedOverlay;
    onOverlayChange?.(feedOverlay);
  }

  const handleAvatarPress = useCallback(
    (userId: string) => {
      // Don't open overlay for own profile
      if (userId === currentUserId) return;
      setProfileUserId(userId);
    },
    [currentUserId]
  );

  // ── Realtime subscriptions — managed at screen level via viewable items ──
  const visiblePostIds = useRef(new Set<string>());

  const handleViewableChange = useCallback(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      const { subscribeToPost, unsubscribeFromPost } = useSocialStore.getState();
      const nowVisible = new Set(viewableItems.map((v) => v.key));

      // Subscribe to newly visible
      nowVisible.forEach((id) => {
        if (!visiblePostIds.current.has(id)) subscribeToPost(id);
      });
      // Unsubscribe from departed
      visiblePostIds.current.forEach((id) => {
        if (!nowVisible.has(id)) unsubscribeFromPost(id);
      });

      visiblePostIds.current = nowVisible;
    },
    []
  );

  // ── Scroll-driven header hide/show ───────────────────────────────────────
  const [localHeaderAnim] = useState(() => new Animated.Value(0));
  const headerOffset = headerAnim ?? localHeaderAnim;

  // The swipe reads where the list is on the UI thread, in step with the finger.
  const listRef = useAnimatedRef<FlashListRef<FeedPost>>();
  useScrollOffset(listRef, listOffset);

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;

    // Show header on first card, hide on all others
    const target = atListTop(y) ? 0 : headerH;
    Animated.timing(headerOffset, {
      toValue: target,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <ListGestureContext.Provider value={listGesture}>
        <FlashList
          ref={listRef}
          renderScrollComponent={FeedScrollView}
          data={posts}
          keyExtractor={(item) => item.id}
          extraData={listExtra}
          renderItem={({ item, index }) =>
            item.locked ? (
              <LockedPostItem
                item={item}
                height={cardHeight}
                text={lockedText}
                onAvatarPress={handleAvatarPress}
                onUnlockPress={() => onGoToCamera?.()}
                topSpace={index === 0 ? topSpace : 0}
              />
            ) : (
              <PostItem
                item={item}
                dark={dark}
                width={screenWidth}
                height={cardHeight}
                onAvatarPress={handleAvatarPress}
                onCommentPress={setCommentPostId}
                topSpace={index === 0 ? topSpace : 0}
              />
            )
          }
          getItemType={(item) => (item.locked ? 'locked' : 'post')}
          snapToInterval={cardHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onViewableItemsChanged={handleViewableChange}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          refreshControl={
            <RefreshControl
              refreshing={isLoading && posts.length === 0}
              onRefresh={refresh}
              tintColor={text}
            />
          }
          ListEmptyComponent={
            !isLoading ? (
              // Starts below the header, which floats over the list and grows with the notch.
              <View style={[styles.empty, { paddingTop: headerH + SPACE.s24 + topSpace }]}>
                <Text style={[styles.emptyTitle, { color: text }]}>No posts yet</Text>
                <Text style={[styles.emptySub, { color: muted }]}>
                  Workouts from you and your friends show up here.
                </Text>
                {onFindFriends ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.lockedButton,
                      styles.emptyButton,
                      { backgroundColor: COLORS.accent },
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={onFindFriends}
                    accessibilityRole="button"
                    accessibilityLabel="Find friends"
                  >
                    <Text style={[styles.lockedButtonText, { color: COLORS.offBlack }]}>
                      Find friends
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
          ListFooterComponent={
            error ? (
              <Text style={[styles.errorText, { color: muted }]}>Failed to load feed</Text>
            ) : null
          }
        />
      </ListGestureContext.Provider>

      {lockExplainer && loaded ? (
        <Animated.View
          pointerEvents="box-none"
          onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}
          style={[
            styles.lockBanner,
            {
              top: headerH,
              // Slides away with the header once the first post scrolls off.
              transform: [
                {
                  translateY: headerOffset.interpolate({
                    inputRange: [0, headerH],
                    outputRange: [0, -(headerH + bannerH)],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        >
          <FeedLockBanner
            locked={locked}
            unlockedUntil={unlockedUntil}
            serverOffsetMs={serverOffsetMs}
            onPost={() => onGoToCamera?.()}
          />
        </Animated.View>
      ) : null}

      {/* Full-screen profile — shown when another user's avatar is tapped */}
      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}

      {/* Comment sheet — opened when comment button is tapped */}
      <CommentSheet postId={commentPostId} dark={dark} onClose={() => setCommentPostId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  topTaggedPills: {
    position: 'relative',
    left: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
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
    fontFamily: FONTS.italic,
    color: withAlpha(COLORS.white, 0.75),
  },
  streakBadge: {
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s6,
    borderRadius: RADIUS.r50,
    backgroundColor: withAlpha(COLORS.white, 0.2),
  },
  streakText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
  responseText: {
    fontSize: FONT_SIZE.f10,
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
  // ── Caption overlay (on image)
  captionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: OFFSET.o70,
    paddingHorizontal: SPACE.s14,
    paddingTop: SPACE.s50,
    paddingBottom: SPACE.s80,
    gap: SPACE.s10,
  },
  captionText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.italic,
    color: COLORS.white,
    textShadowColor: withAlpha(COLORS.black, 0.5),
    textShadowOffset: { width: 0, height: SIZE.z1 },
    textShadowRadius: 3,
  },
  // ── Right-side action column (Reels / TikTok style)
  sideActions: {
    position: 'absolute',
    right: OFFSET.o12,
    bottom: OFFSET.o140,
    alignItems: 'center',
    gap: SPACE.s20,
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
    textShadowColor: withAlpha(COLORS.black, 0.6),
    textShadowOffset: { width: 0, height: SIZE.z1 },
    textShadowRadius: 3,
  },
  // ── Comment rows (shared by CommentSheet)
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACE.s12,
    paddingVertical: SPACE.s8,
    gap: SPACE.s8,
  },
  commentAvatar: {
    width: SIZE.z26,
    height: SIZE.z26,
    borderRadius: RADIUS.r13,
  },
  commentAvatarInitial: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.bold,
  },
  commentBody: {
    flex: 1,
    gap: SPACE.s2,
  },
  commentUsername: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.semiBold,
    letterSpacing: TRACKING.t1,
  },
  commentText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
  commentTime: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.italic,
    paddingTop: SPACE.s2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s12,
    paddingVertical: SPACE.s10,
    gap: SPACE.s8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1,
    height: SIZE.z36,
    borderRadius: RADIUS.r50,
    borderWidth: BORDER_WIDTH.w1,
    paddingHorizontal: SPACE.s14,
    paddingVertical: 0,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
  commentSubmit: {
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s7,
  },
  commentSubmitText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
  // ── Comment sheet (native page sheet)
  sheet: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    paddingTop: SPACE.s20,
    paddingBottom: SPACE.s12,
  },
  sheetList: {
    flex: 1,
  },
  sheetEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetEmptyText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
  // ── Empty / error
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
  },
  pointsOverlay: {
    color: COLORS.white,
  },
  lockedCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s32,
    gap: SPACE.s16,
  },
  lockedWho: {
    alignItems: 'center',
    gap: SPACE.s8,
  },
  lockedAvatar: {
    width: SIZE.z88,
    height: SIZE.z88,
    borderRadius: RADIUS.r44,
    borderWidth: BORDER_WIDTH.w2,
  },
  lockedName: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.bold,
  },
  lockedTime: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
    opacity: 0.7,
  },
  lockedHint: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.italic,
    textAlign: 'center',
  },
  lockedButton: {
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s14,
    paddingHorizontal: SPACE.s32,
  },
  lockedButtonText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  lockBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: SPACE.s16,
  },
  empty: {
    alignItems: 'center',
    gap: SPACE.s8,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.bold,
  },
  emptySub: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
    textAlign: 'center',
    paddingHorizontal: SPACE.s32,
  },
  emptyButton: {
    marginTop: SPACE.s16,
  },
  errorText: {
    textAlign: 'center',
    padding: SPACE.s16,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
});
