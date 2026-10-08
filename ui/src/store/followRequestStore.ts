import { create } from 'zustand';
import {
  getFollowRequests as apiGetFollowRequests,
  respondFollowRequest as apiRespondFollowRequest,
  type FollowRequest,
  type FollowRequestAnswer,
} from '@/api';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import { WAIT } from '@/constants/tokens';
import { useFollowStore } from './followStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Follow requests to my private account (switch `private-accounts`; server:
 * 20261008170000_private_accounts). Requests can be taken back, so the list is never kept on the
 * phone: memory only, `null` (a loading state) until this open's read arrives, live while a
 * screen shows it.
 */
interface FollowRequestState {
  /** Incoming requests, newest first; null until read since the last `clear`. */
  requests: FollowRequest[] | null;
  /** The last read failed. */
  failed: boolean;

  /** Read the list fresh. */
  load: () => Promise<void>;
  /** Forget the list (a screen opening shows a loading state, never old rows). */
  clear: () => void;
  /**
   * Confirm or Delete, optimistic: the row goes at once and comes back if the server refuses.
   * A Confirm makes them my follower (cross-store: followStore's followsMe and my count);
   * `followBack` also follows them, and their button shows the server's answer.
   */
  respond: (
    currentUserId: string,
    requesterId: string,
    accept: boolean,
    followBack?: boolean
  ) => Promise<{ data: FollowRequestAnswer | null; error: Error | null }>;
  /** Live updates while open. Returns the unsubscribe function. */
  subscribe: (userId: string) => () => void;
  reset: () => void;
}

/** One channel per signed-in user, shared by every screen showing the list (ref-counted). */
const requestChannels = new Map<string, { channel: RealtimeChannel; refCount: number }>();

/**
 * Every follow request deleted anywhere reaches the unfiltered DELETE listener, so deletes
 * re-read at most once every `WAIT.requestsReread`: once at the first, then once more after the
 * wait if others came meanwhile.
 */
let rereadTimer: ReturnType<typeof setTimeout> | null = null;
let rereadAgain = false;
function throttledReread(load: () => void) {
  if (rereadTimer) {
    rereadAgain = true;
    return;
  }
  load();
  rereadTimer = setTimeout(() => {
    rereadTimer = null;
    if (rereadAgain) {
      rereadAgain = false;
      throttledReread(load);
    }
  }, WAIT.requestsReread);
}
function stopReread() {
  if (rereadTimer) clearTimeout(rereadTimer);
  rereadTimer = null;
  rereadAgain = false;
}

export const useFollowRequestStore = create<FollowRequestState>((set, get) => ({
  requests: null,
  failed: false,

  load: async () => {
    const { data, error } = await apiGetFollowRequests();
    if (error || !data) {
      reportError(error ?? new Error('get_follow_requests returned no data'), {
        flow: 'follows',
        action: 'loadFollowRequests',
        level: 'warning',
        extra: { rpc: 'get_follow_requests' },
      });
      set({ failed: true });
      return;
    }
    set({ requests: data, failed: false });
  },

  clear: () => set({ requests: null, failed: false }),

  respond: async (currentUserId, requesterId, accept, followBack = false) => {
    const prev = get().requests;
    set({ requests: prev?.filter((r) => r.requester_id !== requesterId) ?? prev });

    const { data, error } = await apiRespondFollowRequest(requesterId, accept, followBack);
    if (error || !data) {
      const answerError = error ?? new Error('respond_follow_request returned no answer');
      console.log('[followRequestStore] respond error |', answerError.message);
      // Back where it was, unless a live read has since replaced the list.
      if (prev && get().requests?.every((r) => r.requester_id !== requesterId)) {
        set({ requests: prev });
      }
      return { data: null, error: answerError };
    }

    if (data.status !== 'gone') track('follow_request_answered', { accepted: accept });
    if (data.status === 'accepted') {
      useFollowStore.setState((s) => {
        const mine = s.counts[currentUserId];
        return {
          followsMe: { ...s.followsMe, [requesterId]: true },
          ...(mine
            ? {
                counts: {
                  ...s.counts,
                  [currentUserId]: { ...mine, follower_count: mine.follower_count + 1 },
                },
              }
            : {}),
        };
      });
    }
    if (data.follow_back) {
      const back = data.follow_back;
      useFollowStore.setState((s) => ({
        followingByMe: { ...s.followingByMe, [requesterId]: back === 'following' },
        requestedByMe: { ...s.requestedByMe, [requesterId]: back === 'requested' },
      }));
    }
    return { data, error: null };
  },

  subscribe: (userId) => {
    const key = `follow-requests:${userId}`;
    const existing = requestChannels.get(key);
    const entry = existing ?? {
      channel: supabase
        .channel(key)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'follow_requests',
            filter: `target_id=eq.${userId}`,
          },
          () => void get().load()
        )
        // Supabase can't filter DELETE events (they carry only the row's key), so a request
        // taken back or answered elsewhere arrives only here; deletes re-read, throttled.
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'follow_requests' },
          () => throttledReread(() => void get().load())
        )
        .subscribe(),
      refCount: 0,
    };
    entry.refCount++;
    if (!existing) requestChannels.set(key, entry);

    // Holds its own entry: after a sign-out, a new subscriber's entry under the same key is not ours.
    return () => {
      if (requestChannels.get(key) !== entry) return;
      entry.refCount--;
      if (entry.refCount <= 0) {
        supabase.removeChannel(entry.channel);
        requestChannels.delete(key);
        stopReread();
      }
    };
  },

  reset: () => {
    for (const { channel } of requestChannels.values()) supabase.removeChannel(channel);
    requestChannels.clear();
    stopReread();
    set({ requests: null, failed: false });
  },
}));
