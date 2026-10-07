import { create } from 'zustand';
import { getFollowData as apiGetFollowData, setFollowing as apiSetFollowing } from '@/api';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/sentry';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface FollowCounts {
  follower_count: number;
  following_count: number;
}

/** Callback invoked when the follows table changes for a subscribed user. */
type FollowChangeListener = () => void;

interface FollowState {
  /** Whether the current user follows userId. Keyed by target userId. */
  followingByMe: Record<string, boolean>;
  /** Whether userId follows the current user (for "Follow back"). Keyed by target userId. */
  followsMe: Record<string, boolean>;
  /** Follower/following counts keyed by userId. */
  counts: Record<string, FollowCounts>;

  /** Load follow status + counts for a user via single RPC. */
  loadFollowData: (currentUserId: string, targetUserId: string) => Promise<void>;
  /** Optimistic toggle follow with rollback. Returns error for caller logging. */
  toggleFollow: (currentUserId: string, targetUserId: string) => Promise<{ error: Error | null }>;

  /** Subscribe to realtime follow changes for a user. Returns unsubscribe fn. */
  subscribeToFollows: (
    userId: string,
    currentUserId: string,
    onChange?: FollowChangeListener
  ) => () => void;

  reset: () => void;
}

/** Active realtime channels keyed by userId. */
const followChannels = new Map<
  string,
  { channel: RealtimeChannel; refCount: number; listeners: Set<FollowChangeListener> }
>();

export const useFollowStore = create<FollowState>((set, get) => ({
  followingByMe: {},
  followsMe: {},
  counts: {},

  loadFollowData: async (currentUserId, targetUserId) => {
    const { data, error } = await apiGetFollowData(currentUserId, targetUserId);

    if (error || !data) {
      reportError(error ?? new Error('get_follow_data returned no data'), {
        flow: 'follows',
        action: 'loadFollowData',
        extra: { targetUserId, rpc: 'get_follow_data' },
      });
      return;
    }

    set((s) => ({
      followingByMe: { ...s.followingByMe, [targetUserId]: data.is_following },
      followsMe: { ...s.followsMe, [targetUserId]: data.follows_you },
      counts: {
        ...s.counts,
        [targetUserId]: {
          follower_count: data.follower_count,
          following_count: data.following_count,
        },
      },
    }));
  },

  toggleFollow: async (currentUserId, targetUserId) => {
    const wasFollowing = get().followingByMe[targetUserId] ?? false;
    const prevCounts = get().counts[targetUserId] ?? { follower_count: 0, following_count: 0 };

    // Optimistic update — target's follower count
    set((s) => ({
      followingByMe: { ...s.followingByMe, [targetUserId]: !wasFollowing },
      counts: {
        ...s.counts,
        [targetUserId]: {
          ...prevCounts,
          follower_count: Math.max(0, prevCounts.follower_count + (wasFollowing ? -1 : 1)),
        },
      },
    }));

    // Also optimistically update current user's following_count if loaded
    const myPrevCounts = get().counts[currentUserId];
    if (myPrevCounts) {
      set((s) => ({
        counts: {
          ...s.counts,
          [currentUserId]: {
            ...myPrevCounts,
            following_count: Math.max(0, myPrevCounts.following_count + (wasFollowing ? -1 : 1)),
          },
        },
      }));
    }

    const { data, error } = await apiSetFollowing(targetUserId, !wasFollowing);

    if (error || !data) {
      const mutationError = error ?? new Error('Follow update returned no server state');
      console.log('[followStore] toggleFollow error |', mutationError.message);
      // Rollback target counts
      set((s) => ({
        followingByMe: { ...s.followingByMe, [targetUserId]: wasFollowing },
        counts: { ...s.counts, [targetUserId]: prevCounts },
      }));
      // Rollback own counts
      if (myPrevCounts) {
        set((s) => ({
          counts: { ...s.counts, [currentUserId]: myPrevCounts },
        }));
      }
      return { error: mutationError };
    }

    // The tap felt immediate above; now replace estimates with the database's committed answer.
    set((s) => ({
      followingByMe: { ...s.followingByMe, [targetUserId]: data.is_following },
      followsMe: { ...s.followsMe, [targetUserId]: data.follows_you },
      counts: {
        ...s.counts,
        [targetUserId]: {
          follower_count: data.follower_count,
          following_count: data.following_count,
        },
        ...(myPrevCounts
          ? {
              [currentUserId]: {
                ...myPrevCounts,
                following_count: data.current_following_count,
              },
            }
          : {}),
      },
    }));

    return { error: null };
  },

  subscribeToFollows: (userId, currentUserId, onChange) => {
    const key = `follows:${userId}`;
    const existing = followChannels.get(key);
    if (existing) {
      existing.refCount++;
      if (onChange) existing.listeners.add(onChange);
      return () => {
        if (onChange) existing.listeners.delete(onChange);
        existing.refCount--;
        if (existing.refCount <= 0) {
          supabase.removeChannel(existing.channel);
          followChannels.delete(key);
        }
      };
    }

    const handler = () => {
      // Re-fetch counts from server
      get().loadFollowData(currentUserId, userId);
      // Notify listener (e.g. FollowListModal re-fetches its list)
      for (const listener of followChannels.get(key)?.listeners ?? []) listener();
    };

    const channel = supabase
      .channel(key)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'follows', filter: `following_id=eq.${userId}` },
        handler
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'follows', filter: `follower_id=eq.${userId}` },
        handler
      )
      .subscribe();

    followChannels.set(key, {
      channel,
      refCount: 1,
      listeners: new Set(onChange ? [onChange] : []),
    });

    return () => {
      const entry = followChannels.get(key);
      if (!entry) return;
      if (onChange) entry.listeners.delete(onChange);
      entry.refCount--;
      if (entry.refCount <= 0) {
        supabase.removeChannel(entry.channel);
        followChannels.delete(key);
      }
    };
  },

  reset: () => {
    // Tear down all follow channels
    for (const [key, { channel }] of followChannels) {
      supabase.removeChannel(channel);
    }
    followChannels.clear();
    set({ followingByMe: {}, followsMe: {}, counts: {} });
  },
}));
