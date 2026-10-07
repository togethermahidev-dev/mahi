import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import {
  toggleLike as apiToggleLike,
  getComments as apiGetComments,
  addComment as apiAddComment,
  getCommentLikes as apiGetCommentLikes,
  toggleCommentLike as apiToggleCommentLike,
  getCommentLikers as apiGetCommentLikers,
  type CommentLiker,
  type CommentWithProfile,
  type FeedPost,
} from '@/api';
import { useFeedStore } from './feedStore';
import { useProfilePostsStore } from './profilePostsStore';
import { useToastStore } from './toastStore';
import { useAuthStore } from './authStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Channel registry — outside store state so channel changes don't trigger renders
const channels = new Map<string, RealtimeChannel>();
const refCounts = new Map<string, number>();

// Cross-store effect: a post's like and comment counts live wherever the post is shown — the
// feed, and the profile grid's posts (which the post viewer pages through). Read from whichever
// holds it; write to both.
function loadedPost(postId: string): FeedPost | undefined {
  return (
    useFeedStore.getState().posts.find((p) => p.id === postId) ??
    useProfilePostsStore.getState().posts.find((p) => p.id === postId)
  );
}

function patchCounts(
  postId: string,
  partial: Pick<Partial<FeedPost>, 'like_count' | 'comment_count'>
) {
  useFeedStore.getState().patchPost(postId, partial);
  useProfilePostsStore.getState().patchPost(postId, partial);
}

/** A comment's heart: whether you liked it and how many have. */
export type CommentLike = { liked: boolean; count: number };
const NO_LIKES: CommentLike = { liked: false, count: 0 };

interface SocialState {
  likedByMe: Record<string, boolean>;
  comments: Record<string, CommentWithProfile[]>;
  /** Comment likes, by comment id. */
  commentLikes: Record<string, CommentLike>;
  /** By post id: this opening's comment likes have arrived (hearts show only then). */
  commentLikesReady: Record<string, boolean>;

  /** Seed liked state for a post from the initial feed load. Idempotent. */
  initPost: (postId: string, likedByMe: boolean) => void;
  /** Optimistic toggle with single-RPC confirm. Writes counts to feedStore. */
  toggleLike: (postId: string, userId: string) => Promise<void>;
  /** Fetch + cache comments for a post. Skips if already loaded. */
  loadComments: (postId: string) => Promise<void>;
  /** Optimistic comment insert with rollback. Increments feedStore comment_count. */
  addComment: (
    postId: string,
    userId: string,
    content: string,
    profile: CommentWithProfile['profiles']
  ) => Promise<void>;
  /** A comment's heart (none yet reads as not liked, 0). */
  commentLike: (commentId: string) => CommentLike;
  /** Read a post's comment likes fresh (each time its comments open); hidden until they arrive. */
  loadCommentLikes: (postId: string) => Promise<void>;
  /** Optimistic like / unlike of a comment, then the server's answer; rolls back on failure. */
  toggleCommentLike: (commentId: string) => Promise<{ error: Error | null }>;
  /** Who liked a comment, straight from the server — never kept here. */
  getCommentLikers: (
    commentId: string
  ) => Promise<{ data: CommentLiker[] | null; error: Error | null }>;
  /** Subscribe to realtime like/comment changes for a post. Ref-counted — safe to call multiple times. */
  subscribeToPost: (postId: string) => void;
  /** Unsubscribe from realtime for a post. Only destroys channel when ref count reaches 0. */
  unsubscribeFromPost: (postId: string) => void;
  reset: () => void;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  likedByMe: {},
  comments: {},
  commentLikes: {},
  commentLikesReady: {},

  initPost: (postId, likedByMe) => {
    // Only seed if not already in store (don't overwrite an already-toggled state)
    if (get().likedByMe[postId] !== undefined) return;
    set((s) => ({ likedByMe: { ...s.likedByMe, [postId]: likedByMe } }));
  },

  toggleLike: async (postId, userId) => {
    const prevLiked = get().likedByMe[postId] ?? false;
    const prevCount = loadedPost(postId)?.like_count ?? 0;

    // Optimistic update
    set((s) => ({ likedByMe: { ...s.likedByMe, [postId]: !prevLiked } }));
    patchCounts(postId, { like_count: Math.max(0, prevCount + (prevLiked ? -1 : 1)) });

    const { data, error } = await apiToggleLike(postId, userId);

    if (error || !data) {
      reportError(error ?? new Error('toggle_like returned no rows'), {
        flow: 'social',
        action: 'toggleLike',
        extra: { postId, wasLiked: prevLiked, rpc: 'toggle_like' },
      });
      // Rollback
      set((s) => ({ likedByMe: { ...s.likedByMe, [postId]: prevLiked } }));
      patchCounts(postId, { like_count: prevCount });
      // Words follow the glossary: "Couldn’t [verb] [thing]. Try again." Liking gets a button.
      if (prevLiked) useToastStore.getState().show('Couldn’t remove your like. Try again.');
      else
        useToastStore.getState().show('Couldn’t like that post.', {
          action: { label: 'Try again', onPress: () => void get().toggleLike(postId, userId) },
        });
    } else {
      // Write authoritative values
      if (data.liked && !prevLiked) track('post_liked', { post_id: postId });
      set((s) => ({ likedByMe: { ...s.likedByMe, [postId]: data.liked } }));
      patchCounts(postId, { like_count: data.like_count });
    }
  },

  loadComments: async (postId) => {
    if (get().comments[postId] !== undefined) return; // already loaded
    const { data, error } = await apiGetComments(postId);
    if (error) {
      reportError(error, {
        flow: 'social',
        action: 'loadComments',
        extra: { postId, table: 'post_comments' },
      });
    }
    if (!error && data) {
      set((s) => ({ comments: { ...s.comments, [postId]: data } }));
    }
  },

  addComment: async (postId, userId, content, profile) => {
    const tempId: string = `temp_${Date.now()}_${Math.random()}`;
    const optimistic: CommentWithProfile = {
      id: tempId,
      post_id: postId,
      user_id: userId,
      content,
      created_at: new Date().toISOString(),
      profiles: profile,
    };

    // Optimistic insert
    set((s) => ({
      comments: {
        ...s.comments,
        [postId]: [...(s.comments[postId] ?? []), optimistic],
      },
    }));
    const prevCount = loadedPost(postId)?.comment_count ?? 0;
    patchCounts(postId, { comment_count: prevCount + 1 });

    const { data, error } = await apiAddComment(postId, userId, content);

    if (error || !data) {
      reportError(error ?? new Error('post_comments insert returned no row'), {
        flow: 'social',
        action: 'addComment',
        extra: { postId, table: 'post_comments' },
      });
      // Rollback
      set((s) => ({
        comments: {
          ...s.comments,
          [postId]: (s.comments[postId] ?? []).filter((c) => c.id !== tempId),
        },
      }));
      patchCounts(postId, { comment_count: prevCount });
      // The sheet puts the words back in the box (CommentSheet).
      useToastStore.getState().show('Couldn’t send your comment. Your words are still in the box.');
    } else {
      track('comment_added', { comment_id: data.id, post_id: postId });
      // Replace temp with confirmed row
      set((s) => ({
        comments: {
          ...s.comments,
          [postId]: (s.comments[postId] ?? []).map((c) => (c.id === tempId ? data : c)),
        },
      }));
    }
  },

  commentLike: (commentId) => get().commentLikes[commentId] ?? NO_LIKES,

  loadCommentLikes: async (postId) => {
    set((s) => ({ commentLikesReady: { ...s.commentLikesReady, [postId]: false } }));
    const { data, error } = await apiGetCommentLikes(postId);
    if (error || !data) {
      console.log('[socialStore] loadCommentLikes', error?.message);
      reportError(error ?? new Error('get_comment_likes returned no data'), {
        flow: 'social',
        action: 'loadCommentLikes',
        extra: { postId, rpc: 'get_comment_likes' },
      });
      return;
    }
    set((s) => {
      const next = { ...s.commentLikes };
      for (const row of data) {
        next[row.comment_id] = { liked: row.liked_by_me, count: Number(row.like_count) };
      }
      return { commentLikes: next, commentLikesReady: { ...s.commentLikesReady, [postId]: true } };
    });
  },

  toggleCommentLike: async (commentId) => {
    // A comment still being sent has no id on the server yet.
    if (commentId.startsWith('temp_')) return { error: null };
    const prev = get().commentLike(commentId);
    const optimistic = {
      liked: !prev.liked,
      count: Math.max(0, prev.count + (prev.liked ? -1 : 1)),
    };
    set((s) => ({ commentLikes: { ...s.commentLikes, [commentId]: optimistic } }));

    const { data, error } = await apiToggleCommentLike(commentId);
    if (error || !data) {
      console.log('[socialStore] toggleCommentLike', error?.message);
      reportError(error ?? new Error('toggle_comment_like returned no rows'), {
        flow: 'social',
        action: 'toggleCommentLike',
        extra: { commentId, wasLiked: prev.liked, rpc: 'toggle_comment_like' },
      });
      set((s) => ({ commentLikes: { ...s.commentLikes, [commentId]: prev } }));
      useToastStore
        .getState()
        .show(
          prev.liked
            ? 'Couldn’t remove your like. Try again.'
            : 'Couldn’t like that comment. Try again.'
        );
      return { error: error ?? new Error('no answer') };
    }
    set((s) => ({
      commentLikes: {
        ...s.commentLikes,
        [commentId]: { liked: data.liked, count: Number(data.like_count) },
      },
    }));
    return { error: null };
  },

  getCommentLikers: (commentId) => apiGetCommentLikers(commentId),

  subscribeToPost: (postId) => {
    const count = refCounts.get(postId) ?? 0;
    refCounts.set(postId, count + 1);
    if (count > 0) return; // already subscribed

    // Re-fetch the authoritative like count on any change.
    const refetchLikes = () => {
      supabase
        .from('post_likes')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId)
        .then(({ count: c, error }) => {
          if (error) {
            reportError(error, {
              flow: 'social',
              action: 'refreshLikeCount',
              level: 'warning',
              extra: { postId, table: 'post_likes' },
            });
          }
          if (c === null) return;
          patchCounts(postId, { like_count: c });
        });
    };

    const channel = supabase
      .channel(`social:${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_likes', filter: `post_id=eq.${postId}` },
        refetchLikes
      )
      // Supabase can't filter DELETE events (they carry only the row id), so an unlike arrives
      // only here; any unlike re-reads this post's count, which is cheap at this size.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'post_likes' },
        refetchLikes
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`,
        },
        async (payload) => {
          // The live row has no commenter attached; the comment sheet shows their name. Your own
          // comment is already there from sending it.
          const row = payload.new as Omit<CommentWithProfile, 'profiles'>;
          if (row.user_id === useAuthStore.getState().user?.id) return;
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .eq('id', row.user_id)
            .single();
          if (!profiles) return;
          const incoming: CommentWithProfile = { ...row, profiles };
          set((s) => {
            const existing = s.comments[postId];
            if (!existing) return s; // not loaded — skip
            if (existing.some((c) => c.id === incoming.id)) return s; // dedup
            // Only bump the count if the post is actually loaded (feed or profile) — otherwise
            // `?? 0` + 1 would corrupt the count to 1 for a post not currently loaded.
            const post = loadedPost(postId);
            if (post) patchCounts(postId, { comment_count: (post.comment_count ?? 0) + 1 });
            return { comments: { ...s.comments, [postId]: [...existing, incoming] } };
          });
        }
      )
      .subscribe();

    channels.set(postId, channel);
  },

  unsubscribeFromPost: (postId) => {
    const count = refCounts.get(postId) ?? 0;
    if (count <= 1) {
      refCounts.delete(postId);
      const ch = channels.get(postId);
      if (ch) {
        supabase.removeChannel(ch);
        channels.delete(postId);
      }
    } else {
      refCounts.set(postId, count - 1);
    }
  },

  reset: () => {
    channels.forEach((ch) => supabase.removeChannel(ch));
    channels.clear();
    refCounts.clear();
    set({ likedByMe: {}, comments: {}, commentLikes: {}, commentLikesReady: {} });
  },
}));
