import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Animated, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useFeedStore, useProfilePostsStore, useSocialStore, useUserStore } from '@/store';
import { HeartIcon, CommentIcon } from '@/components/ScreenIcons';
import TaggedBubbleStack from '@/components/TaggedBubbleStack';
import CaptionText from '@/components/CaptionText';
import PointsBadge from '@/components/PointsBadge';
import DraggablePip from '@/components/DraggablePip';
import PostVideo, { SoundButton } from '@/components/PostVideo';
import { formatWait } from '@/lib/countdown';
import { relativeTime } from '@/lib/relativeTime';
import { streakText } from '@/lib/streakText';
import { mediaTypeOrPhoto } from '@/lib/videoPosts';
import { appHeaderHeight, pipZone } from '@/lib/pip';
import type { FeedPost } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  SPACE,
  RADIUS,
  ICON_SIZE,
  OFFSET,
  SIZE,
  TRACKING,
  SHADOW_BLUR,
  POST_CARD,
} from '@/constants/tokens';

/**
 * One post, full screen (TikTok-style): photo or video, the second shot in a draggable small
 * window, who posted, tags, caption, double-tap and a button to like, a comments button.
 * Used by the Feed and by the post viewer that opens from a profile grid.
 */
export default function PostCard({
  item,
  dark,
  width,
  height,
  onAvatarPress,
  onCommentPress,
  topSpace = 0,
  leftSpace = 0,
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
  /** Room kept on the left for the glass bar (the feed); the small photo stays clear of it. */
  leftSpace?: number;
  /** Video posts: this card is the one on screen, so its videos play. */
  playing?: boolean;
  /** Video posts: the big video's sound (shared across the feed, muted at first). */
  soundOff?: boolean;
  onToggleMuted?: () => void;
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
  const pipSafeZone = pipZone({ width, height }, headerH + OFFSET.o120 + topSpace, leftSpace);

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
          <View
            style={[
              { width, flex: 1 },
              primaryLandscape && primaryKind === 'photo' && styles.letterbox,
            ]}
          >
            {primaryKind === 'video' ? (
              <PostVideo
                uri={primaryUrl}
                playing={playing}
                muted={soundOff}
                style={StyleSheet.absoluteFill}
                accessibilityLabel={`${name}'s video`}
              />
            ) : (
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
            )}
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
            {/* Bottom shade, full width — behind the profile row, caption and the buttons */}
            <LinearGradient
              colors={[
                'transparent',
                withAlpha(COLORS.black, POST_CARD.shadeMid),
                withAlpha(COLORS.black, POST_CARD.shadeBottom),
              ]}
              style={[styles.captionOverlay, { minHeight: height * POST_CARD.shadeHeight }]}
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
        <View
          style={[styles.sideActions, { bottom: height * POST_CARD.actionsBottom }]}
          pointerEvents="box-none"
        >
          {primaryKind === 'video' && onToggleMuted ? (
            <SoundButton muted={soundOff} onToggle={onToggleMuted} />
          ) : null}
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

const styles = StyleSheet.create({
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
    fontFamily: FONTS.italic,
    color: COLORS.white,
    textShadowColor: withAlpha(COLORS.black, 0.5),
    textShadowOffset: { width: 0, height: SIZE.z1 },
    textShadowRadius: 3,
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
  // ── Empty / error
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s8,
  },
  pointsOverlay: {
    color: COLORS.white,
  },
});
