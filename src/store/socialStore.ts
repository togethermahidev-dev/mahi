import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  toggleLike as apiToggleLike,
  getComments as apiGetComments,
  addComment as apiAddComment,
  type CommentWithProfile,
} from '@/api';
import { useFeedStore } from './feedStore';
import { useToastStore } from './toastStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Channel registry — outside store state so channel changes don't trigger renders
const channels = new Map<string, RealtimeChannel>();
const refCounts = new Map<string, number>();

interface SocialState {
  likedByMe: Record<string, boolean>;
  comments: Record<string, CommentWithProfile[]>;

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
  /** Subscribe to realtime like/comment changes for a post. Ref-counted — safe to call multiple times. */
  subscribeToPost: (postId: string) => void;
  /** Unsubscribe from realtime for a post. Only destroys channel when ref count reaches 0. */
  unsubscribeFromPost: (postId: string) => void;
  reset: () => void;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  likedByMe: {},
  comments: {},

  initPost: (postId, likedByMe) => {
    // Only seed if not already in store (don't overwrite an already-toggled state)
    if (get().likedByMe[postId] !== undefined) return;
    set((s) => ({ likedByMe: { ...s.likedByMe, [postId]: likedByMe } }));
  },

  toggleLike: async (postId, userId) => {
    const prevLiked = get().likedByMe[postId] ?? false;
    const feedPost = useFeedStore.getState().posts.find((p) => p.id === postId);
    const prevCount = feedPost?.like_count ?? 0;

    // Optimistic update
    set((s) => ({ likedByMe: { ...s.likedByMe, [postId]: !prevLiked } }));
    useFeedStore.getState().patchPost(postId, {
      like_count: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
    });

    const { data, error } = await apiToggleLike(postId, userId);

    if (error || !data) {
      // Rollback
      set((s) => ({ likedByMe: { ...s.likedByMe, [postId]: prevLiked } }));
      useFeedStore.getState().patchPost(postId, { like_count: prevCount });
      useToastStore.getState().show("Couldn't update like");
    } else {
      // Write authoritative values
      set((s) => ({ likedByMe: { ...s.likedByMe, [postId]: data.liked } }));
      useFeedStore.getState().patchPost(postId, { like_count: data.like_count });
    }
  },

  loadComments: async (postId) => {
    if (get().comments[postId] !== undefined) return; // already loaded
    const { data, error } = await apiGetComments(postId);
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
    const prevCount =
      useFeedStore.getState().posts.find((p) => p.id === postId)?.comment_count ?? 0;
    useFeedStore.getState().patchPost(postId, { comment_count: prevCount + 1 });

    const { data, error } = await apiAddComment(postId, userId, content);

    if (error || !data) {
      // Rollback
      set((s) => ({
        comments: {
          ...s.comments,
          [postId]: (s.comments[postId] ?? []).filter((c) => c.id !== tempId),
        },
      }));
      useFeedStore.getState().patchPost(postId, { comment_count: prevCount });
      useToastStore.getState().show("Couldn't post comment");
    } else {
      // Replace temp with confirmed row
      set((s) => ({
        comments: {
          ...s.comments,
          [postId]: (s.comments[postId] ?? []).map((c) => (c.id === tempId ? data : c)),
        },
      }));
    }
  },

  subscribeToPost: (postId) => {
    const count = refCounts.get(postId) ?? 0;
    refCounts.set(postId, count + 1);
    if (count > 0) return; // already subscribed

    const channel = supabase
      .channel(`social:${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_likes', filter: `post_id=eq.${postId}` },
        () => {
          // Re-fetch authoritative like count on any change
          supabase
            .from('post_likes')
            .select('id', { count: 'exact', head: true })
            .eq('post_id', postId)
            .then(({ count: c }) => {
              if (c === null) return;
              useFeedStore.getState().patchPost(postId, { like_count: c });
            });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          const incoming = payload.new as CommentWithProfile;
          set((s) => {
            const existing = s.comments[postId];
            if (!existing) return s; // not loaded — skip
            if (existing.some((c) => c.id === incoming.id)) return s; // dedup
            // Only bump the feed count if the post is actually in the feed — otherwise
            // `?? 0` + 1 would corrupt the count to 1 for a post not currently loaded.
            const feedPost = useFeedStore.getState().posts.find((p) => p.id === postId);
            if (feedPost) {
              useFeedStore
                .getState()
                .patchPost(postId, { comment_count: (feedPost.comment_count ?? 0) + 1 });
            }
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
    set({ likedByMe: {}, comments: {} });
  },
}));
