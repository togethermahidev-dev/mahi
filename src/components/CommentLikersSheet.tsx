import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
import { useAuthStore } from '@/store';
import { useCommentLikers } from '@/hooks/useCommentLikers';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/**
 * Who liked a comment (flag comment-likes), in a native page sheet over the comments: names and
 * pictures, newest first; a tap opens their profile in the sheet (as Blocked users does). Live
 * server data: a loading state each time it opens, then the fresh list; nothing is kept.
 */
export default function CommentLikersSheet({
  commentId,
  dark,
  onClose,
}: {
  /** The comment whose likes to list; null keeps the sheet closed. */
  commentId: string | null;
  dark: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const bg = dark ? COLORS.bgDark : COLORS.white;
  // Each opening mounts a fresh list (loading first), and keeps it on screen while it slides away.
  const [openId, setOpenId] = useState<string | null>(null);
  const [shown, setShown] = useState<{ commentId: string; opening: number } | null>(null);
  if (commentId !== openId) {
    setOpenId(commentId);
    if (commentId) setShown({ commentId, opening: (shown?.opening ?? 0) + 1 });
  }

  return (
    <Modal
      visible={!!commentId}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own native window: gesture-handler needs its own root (the profile's swipe back),
          and the sheet's insets differ from the screen behind it. */}
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider style={{ backgroundColor: bg }}>
          {shown ? (
            <Likers key={shown.opening} commentId={shown.commentId} dark={dark} onClose={onClose} />
          ) : null}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Likers({
  commentId,
  dark,
  onClose,
}: {
  commentId: string;
  dark: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const myId = useAuthStore((s) => s.user?.id);
  const likers = useCommentLikers(commentId);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a45)
    : withAlpha(COLORS.offBlack, ALPHA.a45);
  const border = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a12)
    : withAlpha(COLORS.offBlack, ALPHA.a12);
  const avatarBg = dark ? COLORS.surfaceDark : COLORS.offWhite;

  return (
    <>
      <View style={[styles.root, { backgroundColor: bg }]}>
        <View
          style={[styles.header, { borderBottomColor: border, paddingTop: insets.top + SPACE.s16 }]}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Back to comments"
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: border },
              pressed && styles.pressed,
            ]}
            hitSlop={OFFSET.o8}
          >
            <Text style={[styles.backArrow, { color: text }]}>{'‹'}</Text>
          </Pressable>
          <Text style={[styles.title, { color: text }]} accessibilityRole="header">
            Likes
          </Text>
          <View style={styles.spacer} />
        </View>

        {likers.status === 'loading' ? (
          <View style={styles.center} accessibilityLabel="Loading likes">
            <ActivityIndicator color={muted} />
          </View>
        ) : likers.status === 'error' ? (
          <View style={styles.center}>
            <Text style={[styles.note, { color: muted }]}>Couldn't load who liked this</Text>
          </View>
        ) : (
          <FlashList
            data={likers.likers}
            keyExtractor={(item) => item.user_id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const name = item.display_name ?? item.username;
              const isMe = item.user_id === myId;
              return (
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && !isMe && styles.pressed]}
                  onPress={() => {
                    if (!isMe) setProfileUserId(item.user_id);
                  }}
                  disabled={isMe}
                  accessibilityRole={isMe ? 'text' : 'button'}
                  accessibilityLabel={isMe ? `${name}, you` : `${name}, @${item.username}`}
                  accessibilityHint={isMe ? undefined : 'Opens their profile'}
                >
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View
                      style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}
                    >
                      <Text style={[styles.initial, { color: text }]}>
                        {(item.username ?? '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.rowText}>
                    <Text style={[styles.name, { color: text }]}>{name}</Text>
                    <Text style={[styles.handle, { color: muted }]}>@{item.username}</Text>
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.note, { color: muted }]}>No likes yet</Text>
              </View>
            }
          />
        )}
      </View>

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
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: SPACE.s16,
    paddingHorizontal: SPACE.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
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
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
  },
  spacer: {
    width: SIZE.z36,
    height: SIZE.z36,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingTop: SPACE.s40,
  },
  note: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
  },
  listContent: {
    paddingHorizontal: SPACE.s20,
    paddingVertical: SPACE.s12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.s10,
    gap: SPACE.s12,
  },
  avatar: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
  },
  rowText: {
    flex: 1,
    gap: SPACE.s2,
  },
  name: {
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
  },
  handle: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
  },
});
