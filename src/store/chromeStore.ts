import { create } from 'zustand';

/**
 * What floats over the pages (the glass bar, and the name, caption and buttons on a post).
 * Shared here so the screens don't pass it down through each other:
 * - `viewing`: a post is being held (hold to view): everything over it fades, the glass bar too.
 * - `covers`: full-screen views open over a page the glass bar would sit on; it hides while any is.
 * - `feedTick`: goes up each time the feed moves to another post, so the Feed icon can bounce.
 */
interface ChromeState {
  viewing: boolean;
  covers: number;
  feedTick: number;
  /** The post last in view in the feed (not shown; it tells a move from the first post). */
  feedPostId: string | null;
  setViewing: (viewing: boolean) => void;
  /** A view that covers the glass bar opened. Call what it returns when it closes (once is enough). */
  cover: () => () => void;
  /** The feed's post in view (null: none). A different post than last time is a move. */
  feedPostShown: (postId: string | null) => void;
  reset: () => void;
}

export const useChromeStore = create<ChromeState>((set, get) => ({
  viewing: false,
  covers: 0,
  feedTick: 0,
  feedPostId: null,

  setViewing: (viewing) => {
    if (get().viewing !== viewing) set({ viewing });
  },

  cover: () => {
    set((s) => ({ covers: s.covers + 1 }));
    let open = true;
    return () => {
      if (!open) return;
      open = false;
      set((s) => ({ covers: Math.max(0, s.covers - 1) }));
    };
  },

  feedPostShown: (postId) => {
    if (!postId) return;
    const last = get().feedPostId;
    if (last === postId) return;
    set((s) => ({ feedPostId: postId, feedTick: last ? s.feedTick + 1 : s.feedTick }));
  },

  reset: () => set({ viewing: false, covers: 0, feedTick: 0, feedPostId: null }),
}));
