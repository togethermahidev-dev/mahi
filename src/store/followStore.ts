import { create } from 'zustand';
import {
  followUser    as apiFollow,
  unfollowUser  as apiUnfollow,
  getFollowData as apiGetFollowData,
} from '@/api';

interface FollowCounts {
  follower_count:  number;
  following_count: number;
}

interface FollowState {
  /** Whether the current user follows userId. Keyed by target userId. */
  followingByMe: Record<string, boolean>;
  /** Follower/following counts keyed by userId. */
  counts:        Record<string, FollowCounts>;

  /** Load follow status + counts for a user via single RPC. */
  loadFollowData: (currentUserId: string, targetUserId: string) => Promise<void>;
  /** Optimistic toggle follow with rollback. Returns error for caller logging. */
  toggleFollow:   (currentUserId: string, targetUserId: string) => Promise<{ error: Error | null }>;
  reset: () => void;
}

export const useFollowStore = create<FollowState>((set, get) => ({
  followingByMe: {},
  counts:        {},

  loadFollowData: async (currentUserId, targetUserId) => {
    const { data, error } = await apiGetFollowData(currentUserId, targetUserId);

    if (error || !data) return;

    set((s) => ({
      followingByMe: { ...s.followingByMe, [targetUserId]: data.is_following },
      counts: {
        ...s.counts,
        [targetUserId]: {
          follower_count:  data.follower_count,
          following_count: data.following_count,
        },
      },
    }));
  },

  toggleFollow: async (currentUserId, targetUserId) => {
    const wasFollowing = get().followingByMe[targetUserId] ?? false;
    const prevCounts   = get().counts[targetUserId] ?? { follower_count: 0, following_count: 0 };

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

    const { error } = wasFollowing
      ? await apiUnfollow(currentUserId, targetUserId)
      : await apiFollow(currentUserId, targetUserId);

    if (error) {
      console.log('[followStore] toggleFollow error |', error.message);
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
      return { error };
    }

    return { error: null };
  },

  reset: () => set({ followingByMe: {}, counts: {} }),
}));
