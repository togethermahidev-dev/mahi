import React, { useState } from 'react';
import { View, Text, Image, Modal, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import CaptionText from '@/components/CaptionText';
import DraggablePip from '@/components/DraggablePip';
import PostVideo, { SoundButton } from '@/components/PostVideo';
import { mediaTypeOrPhoto } from '@/lib/videoPosts';
import { appHeaderHeight, pipZone } from '@/lib/pip';
import { streakText } from '@/lib/streakText';
import type { Database } from '@/types';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  SPACE,
  RADIUS,
  LINE_HEIGHT,
  OFFSET,
  SIZE,
  TRACKING,
} from '@/constants/tokens';

type PostRow = Database['public']['Tables']['posts']['Row'];

interface PostDetailModalProps {
  /** The post to show; null keeps the modal closed. */
  post: PostRow | null;
  onClose: () => void;
}

/** A tapped grid post, full screen, fading in over whatever screen opened it. */
export default function PostDetailModal({
  post,
  onClose,
}: PostDetailModalProps): React.JSX.Element {
  // Keep showing the last post while the modal fades out after `post` goes null.
  const [shown, setShown] = useState(post);
  if (post && post !== shown) setShown(post);

  return (
    <Modal
      visible={!!post}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* A Modal is its own native window: gesture-handler needs its own root here. */}
      <GestureHandlerRootView style={styles.root}>
        {shown ? <PostDetail key={shown.id} post={shown} open={!!post} onClose={onClose} /> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function PostDetail({
  post,
  open,
  onClose,
}: {
  post: PostRow;
  /** Still open (videos pause while it fades out). */
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  // ── Dual-camera PiP ──────────────────────────────────────────────────────
  const hasDual = !!post.pov_image_url;
  const streak = streakText(post.streak_day);
  const [rearIsPrimary, setRearIsPrimary] = useState(true);
  const primaryUrl = hasDual && !rearIsPrimary ? post.pov_image_url! : post.image_url;
  const pipUrl = hasDual && !rearIsPrimary ? post.image_url : post.pov_image_url;
  // Video posts: either shot can be a video; it plays muted, looping, with a sound button.
  const rearKind = mediaTypeOrPhoto(post.rear_media_type);
  const frontKind = mediaTypeOrPhoto(post.front_media_type);
  const primaryKind = hasDual && !rearIsPrimary ? frontKind : rearKind;
  const pipKind = hasDual && !rearIsPrimary ? rearKind : frontKind;
  const [muted, setMuted] = useState(true);

  // ── Draggable PiP (same safe zone as the feed, a little higher: no tagged pills here) ──
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pipSafeZone = pipZone(screen, appHeaderHeight(insets.top) + OFFSET.o60);

  // ── Date string ───────────────────────────────────────────────────────────
  const dateStr = new Date(post.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <>
      {/* Fullscreen image (or video) */}
      {primaryKind === 'video' && primaryUrl ? (
        <PostVideo
          uri={primaryUrl}
          playing={open}
          muted={muted}
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Post video"
        />
      ) : (
        <Image
          source={{ uri: primaryUrl ?? undefined }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}

      {/* Top gradient — close button + streak badge */}
      <LinearGradient
        colors={[withAlpha(COLORS.black, 0.6), 'transparent']}
        style={[styles.topOverlay, { paddingTop: insets.top }]}
      >
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.2 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <Text style={styles.closeX}>✕</Text>
        </Pressable>
        {primaryKind === 'video' ? (
          <SoundButton
            muted={muted}
            onToggle={() => setMuted((m) => !m)}
            style={styles.soundButton}
          />
        ) : null}
        {streak ? (
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>{streak}</Text>
          </View>
        ) : null}
      </LinearGradient>

      {/* Bottom gradient — caption + date */}
      <LinearGradient
        colors={['transparent', withAlpha(COLORS.black, 0.7)]}
        style={styles.bottomOverlay}
        pointerEvents="box-none"
      >
        {post.caption ? (
          <CaptionText
            caption={post.caption}
            tagged={[]}
            style={styles.captionText}
            numberOfLines={4}
          />
        ) : null}
        <Text style={styles.dateText}>{dateStr}</Text>
      </LinearGradient>

      {/* Draggable PiP */}
      {hasDual && pipUrl && (
        <DraggablePip
          uri={pipUrl}
          video={pipKind === 'video'}
          playing={open}
          zone={pipSafeZone}
          onTap={() => setRearIsPrimary((p) => !p)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s16,
    paddingBottom: SPACE.s32,
  },
  closeBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    backgroundColor: withAlpha(COLORS.black, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
    lineHeight: LINE_HEIGHT.l18,
    color: COLORS.white,
  },
  // Video posts: next to the close button; the streak badge stays on the right.
  soundButton: {
    marginLeft: SPACE.s12,
    marginRight: 'auto',
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
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s50,
    paddingBottom: SPACE.s50,
    gap: SPACE.s8,
  },
  captionText: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.italic,
    color: COLORS.white,
    textShadowColor: withAlpha(COLORS.black, 0.5),
    textShadowOffset: { width: 0, height: SIZE.z1 },
    textShadowRadius: 3,
  },
  dateText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.italic,
    letterSpacing: TRACKING.t1,
    color: withAlpha(COLORS.white, 0.6),
  },
});
