import { create } from 'zustand';
import { blockUser as apiBlock, unblockUser as apiUnblock, getBlockedIds } from '@/api';
import { Sentry } from '@/lib/sentry';
import { useFeedStore } from '@/store/feedStore';
import { useMessagesStore } from '@/store/messagesStore';
import { useFollowStore } from '@/store/followStore';

interface BlockState {
  /** All user IDs invisible to the current user (blocked by me + blocked me). */
  blockedSet: Set<string>;
  /** IDs I have explicitly blocked (subset — needed for "Block" vs "Unblock" UI). */
  blockedByMe: Set<string>;
  /** True while a sync is in flight — guards against duplicate concurrent fetches. */
  isSyncing: boolean;

  /** Load blocked IDs on auth. Called once from App.tsx. */
  sync: (userId: string) => Promise<void>;
  /** Optimistic block with rollback. */
  block: (currentUserId: string, targetUserId: string) => Promise<{ error: Error | null }>;
  /** Optimistic unblock with rollback. */
  unblock: (currentUserId: string, targetUserId: string) => Promise<{ error: Error | null }>;
  /** Check if a user is in the blocked set (either direction). */
  isBlocked: (userId: string) => boolean;

  reset: () => void;
}

export const useBlockStore = create<BlockState>((set, get) => ({
  blockedSet: new Set<string>(),
  blockedByMe: new Set<string>(),
  isSyncing: false,

  sync: async (userId) => {
    if (get().isSyncing) return;
    set({ isSyncing: true });

    const { data, error } = await getBlockedIds(userId);
    if (!error && data) {
      const blockedByMe = new Set(data.blockedByMe);
      const blockedSet = new Set([...data.blockedByMe, ...data.blockedMe]);
      set({ blockedByMe, blockedSet });
    }
    set({ isSyncing: false });
  },

  block: async (currentUserId, targetUserId) => {
    const prevBlockedSet = get().blockedSet;
    const prevBlockedByMe = get().blockedByMe;

    // Optimistic update
    const nextBlockedSet = new Set(prevBlockedSet);
    const nextBlockedByMe = new Set(prevBlockedByMe);
    nextBlockedSet.add(targetUserId);
    nextBlockedByMe.add(targetUserId);
    set({ blockedSet: nextBlockedSet, blockedByMe: nextBlockedByMe });

    const { error } = await apiBlock(currentUserId, targetUserId);

    if (error) {
      console.log('[blockStore] block error |', error.message);
      Sentry.captureMessage(error.message, {
        level: 'warning',
        tags: { flow: 'moderation', step: 'block' },
        extra: { targetUserId },
      });
      // Rollback
      set({ blockedSet: prevBlockedSet, blockedByMe: prevBlockedByMe });
      return { error };
    }

    // Refresh dependent stores — the DB trigger already removed follows + hid conversations,
    // and the updated RPC now excludes blocked users from the feed.
    useFeedStore.getState().sync(true);
    useMessagesStore.getState().sync(currentUserId);
    // Clear local follow state for the blocked user
    useFollowStore.setState((s) => ({
      followingByMe: { ...s.followingByMe, [targetUserId]: false },
    }));

    return { error: null };
  },

  unblock: async (currentUserId, targetUserId) => {
    const prevBlockedSet = get().blockedSet;
    const prevBlockedByMe = get().blockedByMe;

    // Optimistic update
    const nextBlockedSet = new Set(prevBlockedSet);
    const nextBlockedByMe = new Set(prevBlockedByMe);
    nextBlockedSet.delete(targetUserId);
    nextBlockedByMe.delete(targetUserId);
    set({ blockedSet: nextBlockedSet, blockedByMe: nextBlockedByMe });

    const { error } = await apiUnblock(currentUserId, targetUserId);

    if (error) {
      console.log('[blockStore] unblock error |', error.message);
      Sentry.captureMessage(error.message, {
        level: 'warning',
        tags: { flow: 'moderation', step: 'unblock' },
        extra: { targetUserId },
      });
      // Rollback
      set({ blockedSet: prevBlockedSet, blockedByMe: prevBlockedByMe });
      return { error };
    }

    // Refresh feed + messages — unblocked user's posts/conversations reappear
    useFeedStore.getState().sync(true);
    useMessagesStore.getState().sync(currentUserId);

    return { error: null };
  },

  isBlocked: (userId) => get().blockedSet.has(userId),

  reset: () => set({ blockedSet: new Set(), blockedByMe: new Set(), isSyncing: false }),
}));
