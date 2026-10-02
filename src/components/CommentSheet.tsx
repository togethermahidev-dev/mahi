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
import { useFeedStore, useProfilePostsStore, useSocialStore, useUserStore } from '@/store';
import KeyboardInset from '@/components/KeyboardInset';
import { relativeTime } from '@/lib/relativeTime';
import type { CommentWithProfile } from '@/api/social';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  SPACE,
  RADIUS,
  BORDER_WIDTH,
  SIZE,
  TRACKING,
} from '@/constants/tokens';

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
  // The post is in the feed, a profile grid (the post viewer), or both.
  const feedCount = useFeedStore((s) => s.posts.find((p) => p.id === postId)?.comment_count);
  const profileCount = useProfilePostsStore(
    (s) => s.posts.find((p) => p.id === postId)?.comment_count
  );
  const commentCount = feedCount ?? profileCount ?? 0;

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
});
