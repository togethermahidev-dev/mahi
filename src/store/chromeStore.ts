import { create } from 'zustand';

/**
 * What floats over the pages (the glass bar, and the name, caption and buttons on a post).
 * Shared here so the screens don't pass it down through each other:
 * - `viewing`: a post is being held (hold to view): everything over it fades.
 * - `covers`: full-screen views open over a page the glass bar would sit on; it hides while any is.
 */
interface ChromeState {
  viewing: boolean;
  covers: number;
  setViewing: (viewing: boolean) => void;
  /** A view that covers the glass bar opened. Call what it returns when it closes (once is enough). */
  cover: () => () => void;
  reset: () => void;
}

export const useChromeStore = create<ChromeState>((set, get) => ({
  viewing: false,
  covers: 0,

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

  reset: () => set({ viewing: false, covers: 0 }),
}));
