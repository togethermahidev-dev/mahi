import { useEffect } from 'react';
import { useAuthStore, useSuggestStore } from '@/store';
import type { SuggestedUser } from '@/api';

export interface UseSuggestedFollowsResult {
  suggestions: SuggestedUser[];
  isLoading: boolean;
  /** Re-fetch suggestions from the server (e.g. on pull-to-refresh). */
  refresh: () => void;
  /** Optimistically follow a suggested user (removes them from the strip). */
  follow: (targetId: string) => void;
}

export function useSuggestedFollows(): UseSuggestedFollowsResult {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const suggestions = useSuggestStore((s) => s.suggestions);
  const isSyncing = useSuggestStore((s) => s.isSyncing);
  const loaded = useSuggestStore((s) => s.loaded);

  // Sync on mount (and on user change) only if the store hasn't loaded yet
  useEffect(() => {
    if (!userId) return;
    if (!loaded && !isSyncing) {
      useSuggestStore.getState().loadSuggestions(userId);
    }
  }, [userId]);

  return {
    suggestions,
    // Only show loading on a truly empty strip — never after first hydration
    isLoading: isSyncing && suggestions.length === 0,
    refresh: () => {
      if (userId) useSuggestStore.getState().loadSuggestions(userId);
    },
    follow: (targetId: string) => {
      if (userId) useSuggestStore.getState().followSuggested(userId, targetId);
    },
  };
}
