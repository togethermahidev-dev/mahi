import { useTagStore } from '@/store';
import type { OpenTag } from '@/api';

export interface UseOpenTagsResult {
  openTags: OpenTag[];
  /** server clock − device clock, from the last read. */
  serverOffsetMs: number;
  /** This session's first read has landed (until then, don't word anything from the tags). */
  loaded: boolean;
}

/**
 * Tags waiting for the user's post. App.tsx reads them on sign-in and whenever the app comes to
 * the foreground; this only watches the store.
 */
export function useOpenTags(): UseOpenTagsResult {
  const openTags = useTagStore((s) => s.openTags);
  const serverOffsetMs = useTagStore((s) => s.serverOffsetMs);
  const loaded = useTagStore((s) => s.openTagsLoaded);
  return { openTags, serverOffsetMs, loaded };
}
