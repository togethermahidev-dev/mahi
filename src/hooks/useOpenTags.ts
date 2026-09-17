import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore, useTagStore } from '@/store';
import type { OpenTag } from '@/api';

export interface UseOpenTagsResult {
  openTags: OpenTag[];
  serverOffsetMs: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/** Tags waiting for the user's post; refreshed on mount and whenever the app comes back. */
export function useOpenTags(): UseOpenTagsResult {
  const userId = useAuthStore((s) => s.user?.id);
  const openTags = useTagStore((s) => s.openTags);
  const serverOffsetMs = useTagStore((s) => s.serverOffsetMs);
  const isSyncing = useTagStore((s) => s.isSyncing);

  useEffect(() => {
    if (!userId) return;
    useTagStore.getState().syncOpenTags();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') useTagStore.getState().syncOpenTags();
    });
    return () => sub.remove();
  }, [userId]);

  return {
    openTags,
    serverOffsetMs,
    isLoading: isSyncing && openTags.length === 0,
    refresh: () => useTagStore.getState().syncOpenTags(),
  };
}
