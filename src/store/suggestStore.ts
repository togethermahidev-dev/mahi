import { create } from 'zustand';
import { getSuggestedFollows as apiGetSuggestedFollows, type SuggestedUser } from '@/api';
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
   * removal back on error. Returns the error for caller logging.
   */
  followSuggested: (
    currentUserId: string,
    targetId: string
  ) => Promise<{ error: Error | null }>;

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
      if (error) console.log('[suggestStore] loadSuggestions error |', error.message);
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
    const { error } = await useFollowStore.getState().toggleFollow(currentUserId, targetId);

    if (error) {
      console.log('[suggestStore] followSuggested error |', error.message);
      // Rollback — restore the user to their original position
      set({ suggestions: prev });
      return { error };
    }

    return { error: null };
  },

  reset: () => set({ suggestions: [], isSyncing: false, loaded: false }),
}));
