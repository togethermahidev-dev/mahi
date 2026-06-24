import { create } from 'zustand';

interface ToastState {
  message: string | null;
  /** Duration the current toast should stay visible, in ms. Read by ToastHost. */
  durationMs: number;
  /** Show a toast. Any layer may call useToastStore.getState().show(msg). */
  show: (message: string, durationMs?: number) => void;
  /** Hide the current toast. */
  hide: () => void;
  reset: () => void;
}

const DEFAULT_DURATION_MS = 2500;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  durationMs: DEFAULT_DURATION_MS,

  show: (message, durationMs = DEFAULT_DURATION_MS) => set({ message, durationMs }),
  hide: () => set({ message: null }),

  reset: () => set({ message: null, durationMs: DEFAULT_DURATION_MS }),
}));
