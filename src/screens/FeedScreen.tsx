import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  useWindowDimensions,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeed } from '@/hooks/useFeed';
import { useFeedStore, useSocialStore, useUserStore, useAuthStore } from '@/store';
import { LikeIcon, CommentIcon } from '@/components/ScreenIcons';
import UserProfileOverlay from '@/components/UserProfileOverlay';
import ConversationScreen from '@/screens/ConversationScreen';
import type { FeedPost, ConversationPreview } from '@/api';
import type { CommentWithProfile } from '@/api/social';

// AppHeader: paddingTop (60 ios / 32 android) + inner row (~36px) + paddingBottom (12)
const APP_HEADER_H = Platform.OS === 'ios' ? 108 : 80;

// Pip dimensions for the feed card
const FEED_PIP_W = 90;
const FEED_PIP_H = 120;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1_000);
  if (secs < 60)  return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── CommentRow ──────────────────────────────────────────────────────────────

function CommentRow({ comment, dark }: { comment: CommentWithProfile; dark: boolean }) {
  const text   = dark ? '#E8E8E3' : '#1A1A17';
  const muted  = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const name   = comment.profiles.display_name ?? comment.profiles.username;
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

// ─── PostItem ────────────────────────────────────────────────────────────────

function PostItem({
  item,
  dark,
  width,
  onAvatarPress,
}: {
  item: FeedPost;
  dark: boolean;
  width: number;
  onAvatarPress: (userId: string) => void;
}) {
  const text   = dark ? '#E8E8E3' : '#1A1A17';
  const muted  = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const border = dark ? 'rgba(232,232,227,0.1)'  : 'rgba(26,26,23,0.1)';
  const cardBg = dark ? '#252521' : '#F5F5F0';

  const name     = item.profiles.display_name ?? item.profiles.username;
  const initials = (item.profiles.username ?? '?')[0].toUpperCase();

  const [rearIsPrimary, setRearIsPrimary] = useState(true);
  const [commentsOpen, setCommentsOpen]   = useState(false);
  const [commentText, setCommentText]     = useState('');

  // ── Store selectors ──────────────────────────────────────────────────────
  const currentUser  = useUserStore((s) => s.profile);
  const likedByMe    = useSocialStore((s) => s.likedByMe[item.id] ?? item.liked_by_me);
  const comments     = useSocialStore((s) => s.comments[item.id]);
  const likeCount    = useFeedStore((s) => {
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
  const hasDual    = !!item.pov_image_url;
  const primaryUrl = hasDual && !rearIsPrimary ? item.pov_image_url! : item.image_url;
  const pipUrl     = hasDual && !rearIsPrimary ? item.image_url : item.pov_image_url;

  // ── Draggable PIP (FaceTime-style) ──────────────────────────────────────
  const containerH = width * (16 / 9);
  const initialPipX = 12;
  const initialPipY = containerH - FEED_PIP_H - 12;
  const pipAnim = useRef(new Animated.ValueXY({ x: initialPipX, y: initialPipY })).current;
  const pipScale = useRef(new Animated.Value(1)).current;
  const pipX = useRef(initialPipX);
  const pipY = useRef(initialPipY);

  // Reset PIP position when FlashList recycles this cell for a different post
  useEffect(() => {
    pipX.current = initialPipX;
    pipY.current = initialPipY;
    pipAnim.setValue({ x: initialPipX, y: initialPipY });
    pipScale.setValue(1);
  }, [item.id]);

  const pipPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        pipAnim.setOffset({ x: pipX.current, y: pipY.current });
        pipAnim.setValue({ x: 0, y: 0 });
        Animated.spring(pipScale, {
          toValue: 1.1,
          useNativeDriver: false,
          speed: 20,
          bounciness: 8,
        }).start();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pipAnim.x, dy: pipAnim.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: (_, gs) => {
        pipAnim.flattenOffset();
        const rawX = pipX.current + gs.dx;
        const rawY = pipY.current + gs.dy;
        const margin = 8;
        pipX.current = Math.max(margin, Math.min(rawX, width - FEED_PIP_W - margin));
        pipY.current = Math.max(margin, Math.min(rawY, containerH - FEED_PIP_H - margin));
        pipAnim.setValue({ x: pipX.current, y: pipY.current });
        Animated.spring(pipScale, {
          toValue: 1,
          useNativeDriver: false,
          speed: 20,
          bounciness: 8,
        }).start();
      },
    }),
  ).current;

  // ── Double-tap medal burst animation ─────────────────────────────────────
  const medalScale   = useRef(new Animated.Value(0)).current;
  const medalOpacity = useRef(new Animated.Value(0)).current;
  const [medalPos, setMedalPos]       = useState({ x: 0, y: 0 });
  const [showMedal, setShowMedal]     = useState(false);

  const triggerMedalBurst = useCallback((x: number, y: number) => {
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
  }, [medalScale, medalOpacity]);

  const handleDoubleTap = useCallback((x: number, y: number) => {
    console.log('[FeedScreen] double-tap post', item.id, '| likedByMe:', likedByMe, '| user:', currentUser?.id);
    if (!currentUser) { console.warn('[FeedScreen] double-tap: no currentUser'); return; }
    if (!likedByMe) {
      console.log('[FeedScreen] double-tap → toggleLike (like)');
      useSocialStore.getState().toggleLike(item.id, currentUser.id);
    } else {
      console.log('[FeedScreen] double-tap → already liked, skipping');
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerMedalBurst(x, y);
  }, [currentUser, likedByMe, item.id, triggerMedalBurst]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd((e) => {
      handleDoubleTap(e.x, e.y);
    });

  // ── Like handler (action bar tap) ───────────────────────────────────────
  const handleLike = useCallback(() => {
    console.log('[FeedScreen] like button tap post', item.id, '| likedByMe:', likedByMe, '| user:', currentUser?.id);
    if (!currentUser) { console.warn('[FeedScreen] like: no currentUser'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useSocialStore.getState().toggleLike(item.id, currentUser.id);
  }, [item.id, currentUser, likedByMe]);

  // ── Comment handlers ─────────────────────────────────────────────────────
  const handleCommentToggle = useCallback(() => {
    setCommentsOpen((v) => {
      const next = !v;
      console.log('[FeedScreen] comment toggle post', item.id, '| open:', next);
      if (next) useSocialStore.getState().loadComments(item.id);
      return next;
    });
  }, [item.id]);

  const handleSubmitComment = useCallback(() => {
    const trimmed = commentText.trim();
    console.log('[FeedScreen] submit comment post', item.id, '| text:', trimmed, '| user:', currentUser?.id);
    if (!trimmed || !currentUser) { console.warn('[FeedScreen] submit comment: missing text or user'); return; }
    useSocialStore.getState().addComment(item.id, currentUser.id, trimmed, {
      id:           currentUser.id,
      username:     currentUser.username,
      display_name: currentUser.display_name ?? null,
      avatar_url:   currentUser.avatar_url   ?? null,
    });
    setCommentText('');
    Keyboard.dismiss();
  }, [commentText, item.id, currentUser]);

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
      {/* Post image — double-tap to like */}
      <View style={[styles.imageContainer, { width }]}>
        <GestureDetector gesture={doubleTap}>
          <View style={{ width, height: width * (16 / 9) }}>
            <Image
              source={{ uri: primaryUrl }}
              style={{ width, height: width * (16 / 9) }}
              resizeMode="cover"
            />
            {/* Overlay gradient + post metadata */}
            <LinearGradient
              colors={['rgba(0,0,0,0.6)', 'transparent']}
              style={styles.postOverlay}
            >
              <TouchableOpacity
                style={styles.avatarRow}
                onPress={() => onAvatarPress(item.profiles.id)}
                activeOpacity={0.75}
              >
                {item.profiles.avatar_url ? (
                  <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                    <Text style={styles.avatarInitial}>{initials}</Text>
                  </View>
                )}
                <View style={styles.userInfo}>
                  <Text style={styles.usernameOverlay}>{name}</Text>
                  <Text style={styles.timeOverlay}>{relativeTime(item.created_at)}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>DAY {item.streak_day}</Text>
              </View>
            </LinearGradient>
            {/* Medal burst overlay — shown on double-tap */}
            {showMedal && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.medalBurst,
                  {
                    left: medalPos.x - 40,
                    top:  medalPos.y - 40,
                    transform: [{ scale: medalScale }],
                    opacity:   medalOpacity,
                  },
                ]}
              >
                <LikeIcon size={80} color="#FFFFFF" filled count={likeCount} />
              </Animated.View>
            )}
          </View>
        </GestureDetector>
        {/* Draggable PIP — outside GestureDetector to avoid gesture conflicts */}
        {hasDual && pipUrl && (
          <Animated.View
            style={[
              styles.feedPip,
              { transform: [...pipAnim.getTranslateTransform(), { scale: pipScale }] },
            ]}
            {...pipPanResponder.panHandlers}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { console.log('[FeedScreen] PIP swap post', item.id); setRearIsPrimary(p => !p); }}
              style={StyleSheet.absoluteFillObject}
            >
              <Image
                source={{ uri: pipUrl }}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 10 }]}
                resizeMode="cover"
              />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {item.caption ? (
        <Text style={[styles.caption, { color: text }]}>{item.caption}</Text>
      ) : null}

      {/* ── Action bar ── */}
      <View style={[styles.actionBar, { borderTopColor: border }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike} activeOpacity={0.7}>
          <LikeIcon size={44} color={text} filled={likedByMe} count={likeCount} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleCommentToggle} activeOpacity={0.7}>
          <CommentIcon size={22} color={muted} />
          <Text style={[styles.actionCount, { color: muted }]}>{commentCount}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Inline comments section ── */}
      {commentsOpen && (
        <View style={[styles.commentsSection, { borderTopColor: border }]}>
          {comments && comments.length > 0 && (
            <FlashList
              data={comments}
              keyExtractor={(c) => c.id}
              renderItem={({ item: comment }) => (
                <CommentRow comment={comment} dark={dark} />
              )}
              estimatedItemSize={56}
              scrollEnabled={false}
            />
          )}

          {/* Comment input */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[styles.commentInputRow, { borderTopColor: border }]}>
              <TextInput
                style={[styles.commentInput, { color: text, borderColor: border }]}
                placeholder="Add a comment…"
                placeholderTextColor={muted}
                value={commentText}
                onChangeText={setCommentText}
                returnKeyType="send"
                onSubmitEditing={handleSubmitComment}
              />
              <TouchableOpacity
                style={[styles.commentSubmit, { backgroundColor: '#59c2d7' }]}
                onPress={handleSubmitComment}
                activeOpacity={0.75}
              >
                <Text style={styles.commentSubmitText}>SEND</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

// ─── FeedScreen ──────────────────────────────────────────────────────────────

interface FeedScreenProps {
  onScrollTopChange?: (atTop: boolean) => void;
  headerAnim?: Animated.Value;
}

export default function FeedScreen({ onScrollTopChange, headerAnim }: FeedScreenProps = {}): React.JSX.Element {
  const { dark } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const bg    = dark ? '#1C1C19' : '#FFFFFF';
  const text  = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';

  const { posts, isLoading, error, hasMore, loadMore, refresh } = useFeed();

  // Profile overlay + conversation overlay — lifted to FeedScreen so overlays
  // cover the full screen (not just the PostItem card)
  const [profileUserId, setProfileUserId]   = useState<string | null>(null);
  const [activeConvo,   setActiveConvo]     = useState<ConversationPreview | null>(null);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const handleAvatarPress = useCallback((userId: string) => {
    // Don't open overlay for own profile
    if (userId === currentUserId) return;
    setProfileUserId(userId);
  }, [currentUserId]);

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
    [],
  );

  // ── Scroll-driven header hide/show ───────────────────────────────────────
  const lastScrollY        = useRef(0);
  const localHeaderAnim    = useRef(new Animated.Value(0)).current;
  const headerOffset       = headerAnim ?? localHeaderAnim;

  const atTopRef = useRef(true);

  const handleScroll = (e: any) => {
    const y     = e.nativeEvent.contentOffset.y;
    const delta = y - lastScrollY.current;
    lastScrollY.current = y;

    const isAtTop = y <= 2;
    if (isAtTop !== atTopRef.current) {
      atTopRef.current = isAtTop;
      console.log('[FeedScreen] scroll top change → atTop:', isAtTop, '| y:', y);
      onScrollTopChange?.(isAtTop);
    }

    if (isAtTop) {
      Animated.timing(headerOffset, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      return;
    }

    headerOffset.setValue(
      Math.min(APP_HEADER_H, Math.max(0, (headerOffset as any)._value + delta)),
    );
  };

  const listHeader = <View style={{ height: APP_HEADER_H }} />;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <FlashList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostItem item={item} dark={dark} width={screenWidth} onAvatarPress={handleAvatarPress} />
        )}
        estimatedItemSize={screenWidth * (16 / 9) + 72}
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={handleViewableChange}
        viewabilityConfig={{ itemVisiblePercentThreshold: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && posts.length === 0}
            onRefresh={refresh}
            tintColor={text}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: text }]}>NO POSTS YET</Text>
              <Text style={[styles.emptySub, { color: muted }]}>
                Take your first streak photo to appear here
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          error ? (
            <Text style={[styles.errorText, { color: muted }]}>Failed to load feed</Text>
          ) : null
        }
      />

      {/* Profile overlay — shown when another user's avatar is tapped */}
      {profileUserId ? (
        <UserProfileOverlay
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onOpenConvo={(convo) => {
            setProfileUserId(null);
            setActiveConvo(convo);
          }}
          dark={dark}
        />
      ) : null}

      {/* Conversation screen overlay — opened from profile overlay */}
      {activeConvo && currentUserId ? (
        <ConversationScreen
          conversation={activeConvo}
          currentUserId={currentUserId}
          onBack={() => setActiveConvo(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    paddingBottom: 32,
  },
  card: {
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  postOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 32,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontFamily: 'JosefinSans_700Bold',
    color: '#FFFFFF',
  },
  userInfo: {
    gap: 2,
  },
  usernameOverlay: {
    fontSize: 13,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },
  timeOverlay: {
    fontSize: 11,
    fontFamily: 'JosefinSans_400Regular_Italic',
    color: 'rgba(255,255,255,0.75)',
  },
  streakBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  streakText: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  imageContainer: {
    position: 'relative',
  },
  feedPip: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: FEED_PIP_W,
    height: FEED_PIP_H,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  medalBurst: {
    position: 'absolute',
    width: 80,
    height: 80,
  },
  caption: {
    padding: 12,
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  // ── Action bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    fontSize: 13,
    fontFamily: 'JosefinSans_600SemiBold',
  },
  // ── Comments section
  commentsSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  commentAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  commentAvatarInitial: {
    fontSize: 10,
    fontFamily: 'JosefinSans_700Bold',
  },
  commentBody: {
    flex: 1,
    gap: 2,
  },
  commentUsername: {
    fontSize: 11,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 1,
  },
  commentText: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  commentTime: {
    fontSize: 10,
    fontFamily: 'JosefinSans_400Regular_Italic',
    paddingTop: 2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1,
    height: 36,
    borderRadius: 50,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  commentSubmit: {
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  commentSubmitText: {
    fontSize: 11,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  // ── Empty / error
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 6,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    textAlign: 'center',
    padding: 16,
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
});
