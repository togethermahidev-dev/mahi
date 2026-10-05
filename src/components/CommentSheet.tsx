import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  TextInput,
  Keyboard,
  Modal,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { haptic } from '@/lib/haptics';
import { useFeedStore, useProfilePostsStore, useSocialStore, useUserStore } from '@/store';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import KeyboardInset from '@/components/KeyboardInset';
import CommentLikersSheet from '@/components/CommentLikersSheet';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { HeartIcon } from '@/components/ScreenIcons';
import { relativeTime } from '@/lib/relativeTime';
import type { CommentWithProfile } from '@/api/social';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  ICON_SIZE,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  TRACKING,
  withAlpha,
} from '@/constants/tokens';

function CommentRow({
  comment,
  dark,
  showLikes,
  onShowLikers,
  onOpenProfile,
}: {
  comment: CommentWithProfile;
  dark: boolean;
  /** Comment likes (flag comment-likes), once this opening's numbers have arrived. */
  showLikes: boolean;
  /** Tap on the count: who liked it. */
  onShowLikers: (commentId: string) => void;
  /** Tap on the photo, name or words: open the commenter's profile. */
  onOpenProfile: (userId: string) => void;
}) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a45)
    : withAlpha(COLORS.offBlack, ALPHA.a45);
  const name = comment.profiles.display_name ?? comment.profiles.username;
  const initials = (comment.profiles.username ?? '?')[0].toUpperCase();
  const like = useSocialStore((s) => s.commentLikes[comment.id]);
  const liked = like?.liked ?? false;
  const count = like?.count ?? 0;
  // A comment still being sent has nothing on the server to like yet.
  const sending = comment.id.startsWith('temp_');

  return (
    <View style={styles.commentRow}>
      <Pressable
        style={({ pressed }) => [styles.commentMain, pressed && { opacity: ALPHA.a60 }]}
        onPress={() => onOpenProfile(comment.profiles.id)}
        accessibilityRole="button"
        accessibilityLabel={`${name}: ${comment.content}`}
        accessibilityHint={`Opens ${name}'s profile`}
      >
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
        <Text style={[styles.commentTime, { color: muted }]}>
          {relativeTime(comment.created_at)}
        </Text>
      </Pressable>
      {showLikes ? (
        <View style={styles.likeCol}>
          <Pressable
            style={({ pressed }) => [styles.likeBtn, pressed && { opacity: ALPHA.a60 }]}
            onPress={() => {
              haptic('tick');
              useSocialStore.getState().toggleCommentLike(comment.id);
            }}
            disabled={sending}
            hitSlop={OFFSET.o8}
            accessibilityRole="button"
            accessibilityLabel={liked ? `Unlike ${name}'s comment` : `Like ${name}'s comment`}
            accessibilityState={{ selected: liked, disabled: sending }}
          >
            <HeartIcon size={ICON_SIZE.i16} color={liked ? text : muted} filled={liked} />
          </Pressable>
          {count > 0 ? (
            <Pressable
              onPress={() => onShowLikers(comment.id)}
              hitSlop={OFFSET.o8}
              accessibilityRole="button"
              accessibilityLabel={`${count} ${count === 1 ? 'like' : 'likes'}`}
              accessibilityHint="Shows who liked it"
            >
              <Text style={[styles.likeCount, { color: muted }]}>{count}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Comments for one post in a native iOS page sheet; swipe down or Android back closes it. */
export default function CommentSheet({
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
      {/* A Modal is its own window: gesture-handler needs its own root (a commenter's profile
          swipes closed with a pan), and the sheet's insets differ from the screen behind it. */}
      <GestureHandlerRootView style={styles.sheet}>
        <SafeAreaProvider>
          <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
            {shownId ? <CommentThread key={shownId} postId={shownId} dark={dark} /> : null}
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function CommentThread({ postId, dark }: { postId: string; dark: boolean }) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a45)
    : withAlpha(COLORS.offBlack, ALPHA.a45);
  const border = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a10)
    : withAlpha(COLORS.offBlack, ALPHA.a10);

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
  // The post is in the feed, a profile grid (the post viewer), or both.
  const feedCount = useFeedStore((s) => s.posts.find((p) => p.id === postId)?.comment_count);
  const profileCount = useProfilePostsStore(
    (s) => s.posts.find((p) => p.id === postId)?.comment_count
  );
  const commentCount = feedCount ?? profileCount ?? 0;

  useEffect(() => {
    useSocialStore.getState().loadComments(postId);
  }, [postId]);

  // Comment likes (flag comment-likes): read fresh each time the comments open; the hearts show
  // once they've arrived, so a count never jumps from an old number to a new one.
  const likesOn = useFeatureFlag('comment-likes');
  const likesReady = useSocialStore((s) => s.commentLikesReady[postId] === true);
  const showLikes = likesOn && likesReady;
  useEffect(() => {
    if (likesOn) useSocialStore.getState().loadCommentLikes(postId);
  }, [likesOn, postId]);
  const [likersFor, setLikersFor] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const openProfile = useCallback((userId: string) => {
    Keyboard.dismiss();
    setProfileUserId(userId);
  }, []);
  const showLikers = useCallback((commentId: string) => {
    Keyboard.dismiss();
    setLikersFor(commentId);
  }, []);

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
            extraData={showLikes}
            renderItem={({ item: comment }) => (
              <CommentRow
                comment={comment}
                dark={dark}
                showLikes={showLikes}
                onShowLikers={showLikers}
                onOpenProfile={openProfile}
              />
            )}
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
            pressed && { opacity: ALPHA.a75 },
          ]}
          onPress={handleSubmitComment}
          accessibilityRole="button"
          accessibilityLabel="Send comment"
        >
          <Text style={styles.commentSubmitText}>Send</Text>
        </Pressable>
      </View>
      <KeyboardInset />

      {/* Who liked a comment — a page sheet over this one */}
      <CommentLikersSheet commentId={likersFor} dark={dark} onClose={() => setLikersFor(null)} />

      {/* A commenter's profile, over the comments; swipe or back returns to them */}
      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Comment rows (shared by CommentSheet)
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACE.s12,
    paddingVertical: SPACE.s8,
    gap: SPACE.s8,
  },
  /** Photo, name, words and time: one tap target that opens the commenter's profile. */
  commentMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    fontFamily: FONTS.regular,
  },
  commentTime: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.regular,
    paddingTop: SPACE.s2,
  },
  // ── Comment likes: a heart with its count under it, on the right of each comment
  likeCol: {
    alignItems: 'center',
    minWidth: SIZE.z32,
  },
  likeBtn: {
    width: SIZE.z32,
    height: SIZE.z24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeCount: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.semiBold,
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
    fontFamily: FONTS.regular,
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
    fontFamily: FONTS.regular,
  },
});
