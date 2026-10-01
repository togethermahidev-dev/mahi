import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore, useTagStore } from '@/store';
import type { OpenTag } from '@/api';

export interface UseOpenTagsResult {
  openTags: OpenTag[];
  serverOffsetMs: number;
  isLoading: boolean;
  /** This session's first read has landed (until then, don't word anything from the tags). */
  loaded: boolean;
  refresh: () => Promise<void>;
}

/** Tags waiting for the user's post; refreshed on mount and whenever the app comes back. */
export function useOpenTags(): UseOpenTagsResult {
  const userId = useAuthStore((s) => s.user?.id);
  const openTags = useTagStore((s) => s.openTags);
  const serverOffsetMs = useTagStore((s) => s.serverOffsetMs);
  const isSyncing = useTagStore((s) => s.isSyncing);
  const loaded = useTagStore((s) => s.openTagsLoaded);

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
    loaded,
    refresh: () => useTagStore.getState().syncOpenTags(),
  };
}
