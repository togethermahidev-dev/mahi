import { create } from 'zustand';
import {
  getSuggestedFollows as apiGetSuggestedFollows,
  type FollowStatus,
  type SuggestedUser,
} from '@/api';
import { reportError } from '@/lib/sentry';
import { useFollowStore } from './followStore';

interface SuggestState {
  /** The current suggestion strip for the signed-in user. */
  suggestions: SuggestedUser[];
  /** True while loadSuggestions is in flight. */
  isSyncing: boolean;
  /** True once suggestions have been loaded at least once (even if empty). */
  loaded: boolean;

  /** Load follow suggestions for the current user. Guards concurrent + repeat loads. */
  loadSuggestions: (currentUserId: string) => Promise<void>;
  /**
   * Optimistically follow a suggested user: remove them from the strip and
   * delegate the actual follow to followStore (legal store->store). Rolls the
   * removal back on error. Returns the error for caller logging, and the server's answer
   * (`requested` when they are private).
   */
  followSuggested: (
    currentUserId: string,
    targetId: string
  ) => Promise<{ error: Error | null; status?: FollowStatus }>;

  reset: () => void;
}

export const useSuggestStore = create<SuggestState>((set, get) => ({
  suggestions: [],
  isSyncing: false,
  loaded: false,

  loadSuggestions: async (currentUserId) => {
    // Guard concurrent loads
    if (get().isSyncing) return;

    set({ isSyncing: true });
    const { data, error } = await apiGetSuggestedFollows(currentUserId);

    if (error || !data) {
      if (error) {
        console.log('[suggestStore] loadSuggestions error |', error.message);
        reportError(error, {
          flow: 'follows',
          action: 'loadSuggestions',
          extra: { rpc: 'get_suggested_follows' },
        });
      }
      set({ isSyncing: false, loaded: true });
      return;
    }

    set({ suggestions: data, isSyncing: false, loaded: true });
  },

  followSuggested: async (currentUserId, targetId) => {
    const prev = get().suggestions;
    const target = prev.find((u) => u.id === targetId);
    if (!target) return { error: null };

    // Optimistically remove the followed user from the strip
    set({ suggestions: prev.filter((u) => u.id !== targetId) });

    // Delegate the actual follow to followStore (only legal sideways import)
    // A private suggestion shows Requested at once; one whose privacy an older server didn't
    // say moves no count until the server answers.
    if (target.is_private) {
      useFollowStore.setState((s) => ({ privateById: { ...s.privateById, [targetId]: true } }));
    }
    const { error, status } = await useFollowStore
      .getState()
      .toggleFollow(currentUserId, targetId, { holdCounts: target.is_private === undefined });

    if (error) {
      console.log('[suggestStore] followSuggested error |', error.message);
      // Rollback — restore the user to their original position
      set({ suggestions: prev });
      return { error };
    }

    return { error: null, status };
  },

  reset: () => set({ suggestions: [], isSyncing: false, loaded: false }),
}));
