import { create } from 'zustand';
import { WAIT } from '@/constants/tokens';

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

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  durationMs: WAIT.toast,

  show: (message, durationMs = WAIT.toast) => set({ message, durationMs }),
  hide: () => set({ message: null }),

  reset: () => set({ message: null, durationMs: WAIT.toast }),
}));
