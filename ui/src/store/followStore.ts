import { create } from 'zustand';
import {
  getFollowData as apiGetFollowData,
  removeFollower as apiRemoveFollower,
  setFollowing as apiSetFollowing,
  type FollowStatus,
} from '@/api';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface FollowCounts {
  follower_count: number;
  following_count: number;
}

/**
 * `holdCounts`: whether they are private isn't known yet (a suggestion from an older server), so
 * no count moves until the server answers — a request never counts.
 */
type FollowOptions = { holdCounts?: boolean };

/** Callback invoked when the follows table changes for a subscribed user. */
type FollowChangeListener = () => void;

interface FollowState {
  /** Whether the current user follows userId. Keyed by target userId. */
  followingByMe: Record<string, boolean>;
  /** Whether userId follows the current user (for "Follow back"). Keyed by target userId. */
  followsMe: Record<string, boolean>;
  /** My follow request to a private userId is waiting ("Requested"). Keyed by target userId. */
  requestedByMe: Record<string, boolean>;
  /** userId's account is private, as the server last said. Keyed by target userId. */
  privateById: Record<string, boolean>;
  /** Follower/following counts keyed by userId. */
  counts: Record<string, FollowCounts>;

  /** Load follow status + counts for a user via single RPC. */
  loadFollowData: (currentUserId: string, targetUserId: string) => Promise<void>;
  /**
   * The follow button: Follow (or Follow back) follows, Following unfollows, Requested takes the
   * request back. Optimistic with rollback; `status` is the server's committed answer.
   */
  toggleFollow: (
    currentUserId: string,
    targetUserId: string,
    opts?: FollowOptions
  ) => Promise<{ error: Error | null; status?: FollowStatus }>;
  /** Follow (true) or unfollow / take back a request (false), whatever the button shows. */
  setFollow: (
    currentUserId: string,
    targetUserId: string,
    follow: boolean,
    opts?: FollowOptions
  ) => Promise<{ error: Error | null; status?: FollowStatus }>;
  /** Remove someone who follows me (they aren't told). Optimistic with rollback. */
  removeFollower: (
    currentUserId: string,
    followerId: string
  ) => Promise<{ error: Error | null; tagsEnded?: number }>;

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
  requestedByMe: {},
  privateById: {},
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
      requestedByMe: {
        ...s.requestedByMe,
        [targetUserId]: !data.is_following && data.requested === true,
      },
      privateById: { ...s.privateById, [targetUserId]: data.is_private },
      counts: {
        ...s.counts,
        [targetUserId]: {
          follower_count: data.follower_count,
          following_count: data.following_count,
        },
      },
    }));
  },

  toggleFollow: (currentUserId, targetUserId, opts) => {
    const s = get();
    const engaged =
      (s.followingByMe[targetUserId] ?? false) || (s.requestedByMe[targetUserId] ?? false);
    return get().setFollow(currentUserId, targetUserId, !engaged, opts);
  },

  setFollow: async (currentUserId, targetUserId, follow, opts) => {
    const wasFollowing = get().followingByMe[targetUserId] ?? false;
    const wasRequested = get().requestedByMe[targetUserId] ?? false;
    const prevCounts = get().counts[targetUserId] ?? { follower_count: 0, following_count: 0 };
    const myPrevCounts = get().counts[currentUserId];
    // A private account's follow is a request: Requested at once, and no count moves.
    const asRequest = follow && !wasFollowing && (get().privateById[targetUserId] ?? false);
    // Following → not following (or the reverse) moves the counts; a request never does.
    const countStep = opts?.holdCounts
      ? 0
      : follow
        ? wasFollowing || asRequest
          ? 0
          : 1
        : wasFollowing
          ? -1
          : 0;

    set((st) => ({
      followingByMe: { ...st.followingByMe, [targetUserId]: follow && !asRequest },
      requestedByMe: { ...st.requestedByMe, [targetUserId]: asRequest },
      counts: {
        ...st.counts,
        [targetUserId]: {
          ...prevCounts,
          follower_count: Math.max(0, prevCounts.follower_count + countStep),
        },
        ...(myPrevCounts
          ? {
              [currentUserId]: {
                ...myPrevCounts,
                following_count: Math.max(0, myPrevCounts.following_count + countStep),
              },
            }
          : {}),
      },
    }));

    const { data, error } = await apiSetFollowing(targetUserId, follow);

    if (error || !data) {
      const mutationError = error ?? new Error('Follow update returned no server state');
      console.log('[followStore] setFollow error |', mutationError.message);
      set((st) => ({
        followingByMe: { ...st.followingByMe, [targetUserId]: wasFollowing },
        requestedByMe: { ...st.requestedByMe, [targetUserId]: wasRequested },
        counts: {
          ...st.counts,
          [targetUserId]: prevCounts,
          ...(myPrevCounts ? { [currentUserId]: myPrevCounts } : {}),
        },
      }));
      return { error: mutationError };
    }

    // Counted only when the server's answer is a real change, so a repeat tap is not a new follow.
    if (data.status === 'following' && !wasFollowing) {
      track('user_followed', { target_id: targetUserId, friends: data.follows_you });
    } else if (data.status === 'requested' && !wasRequested) {
      track('follow_requested', { target_id: targetUserId });
    } else if (data.status === 'none' && wasFollowing) {
      track('user_unfollowed', { target_id: targetUserId });
    } else if (data.status === 'none' && wasRequested) {
      track('follow_request_cancelled', { target_id: targetUserId });
    }

    // The tap felt immediate above; now replace estimates with the database's committed answer.
    set((st) => ({
      followingByMe: { ...st.followingByMe, [targetUserId]: data.status === 'following' },
      requestedByMe: { ...st.requestedByMe, [targetUserId]: data.status === 'requested' },
      followsMe: { ...st.followsMe, [targetUserId]: data.follows_you },
      privateById: { ...st.privateById, [targetUserId]: data.is_private },
      counts: {
        ...st.counts,
        [targetUserId]: {
          follower_count: data.follower_count,
          following_count: data.following_count,
        },
        ...(myPrevCounts
          ? {
              [currentUserId]: {
                ...(st.counts[currentUserId] ?? myPrevCounts),
                following_count: data.current_following_count,
              },
            }
          : {}),
      },
    }));

    return { error: null, status: data.status };
  },

  removeFollower: async (currentUserId, followerId) => {
    const wasFollower = get().followsMe[followerId];
    const myPrevCounts = get().counts[currentUserId];

    set((st) => ({
      followsMe: { ...st.followsMe, [followerId]: false },
      ...(myPrevCounts
        ? {
            counts: {
              ...st.counts,
              [currentUserId]: {
                ...myPrevCounts,
                follower_count: Math.max(0, myPrevCounts.follower_count - 1),
              },
            },
          }
        : {}),
    }));

    const { data, error } = await apiRemoveFollower(followerId);

    if (error || !data) {
      const mutationError = error ?? new Error('remove_follower returned no answer');
      console.log('[followStore] removeFollower error |', mutationError.message);
      set((st) => {
        const followsMe = { ...st.followsMe };
        if (wasFollower === undefined) delete followsMe[followerId];
        else followsMe[followerId] = wasFollower;
        return {
          followsMe,
          ...(myPrevCounts ? { counts: { ...st.counts, [currentUserId]: myPrevCounts } } : {}),
        };
      });
      return { error: mutationError };
    }

    // Already gone (they unfollowed first): put my count back, nothing was removed.
    if (!data.removed && myPrevCounts) {
      set((st) => ({ counts: { ...st.counts, [currentUserId]: myPrevCounts } }));
    }
    if (data.removed) track('follower_removed', { tags_ended: data.tags_ended });
    return { error: null, tagsEnded: data.tags_ended };
  },

  subscribeToFollows: (userId, currentUserId, onChange) => {
    const key = `follows:${userId}`;
    const existing = followChannels.get(key);
    if (existing) {
      existing.refCount++;
      if (onChange) existing.listeners.add(onChange);
      return () => {
        if (followChannels.get(key) !== existing) return; // torn down by a sign-out
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
      // Supabase can't filter DELETE events (they carry only the row id), so an unfollow arrives
      // only here; any unfollow re-reads, which is cheap at this size.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'follows' }, handler)
      .subscribe();

    const entry = { channel, refCount: 1, listeners: new Set(onChange ? [onChange] : []) };
    followChannels.set(key, entry);

    // Holds its own entry: after a sign-out, a new subscriber's entry under the same key is not ours.
    return () => {
      if (followChannels.get(key) !== entry) return; // torn down by a sign-out
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
    set({ followingByMe: {}, followsMe: {}, requestedByMe: {}, privateById: {}, counts: {} });
  },
}));
