import { create } from 'zustand';
import { toastDuration } from '@/lib/toast';

/** The one button a toast can carry ("Try again", "Undo"). */
export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
}

/** Where the toast must keep clear of: the phone's tab bar, and the post preview's controls. */
export interface ToastRoom {
  /** The room the tab bar takes at the bottom of the screen (0 = no bar showing). */
  tabBar: number;
  /** The post preview is up: the toast sits at the top, clear of its Post button. */
  top: boolean;
}

interface ToastState {
  message: string | null;
  /** Duration the current toast should stay visible, in ms. Read by ToastHost. */
  durationMs: number;
  action: ToastAction | null;
  room: ToastRoom;
  /**
   * Show a toast. Any layer may call useToastStore.getState().show(msg). It stays by its length
   * (toastDuration); a number is the least an older caller wants it to stay.
   */
  show: (message: string, options?: ToastOptions | number) => void;
  /** Hide the current toast. */
  hide: () => void;
  setRoom: (room: Partial<ToastRoom>) => void;
  reset: () => void;
}

const NO_ROOM: ToastRoom = { tabBar: 0, top: false };

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  durationMs: toastDuration('', false),
  action: null,
  room: NO_ROOM,

  show: (message, options) => {
    const action = typeof options === 'object' ? (options.action ?? null) : null;
    const byLength = toastDuration(message, !!action);
    const durationMs = typeof options === 'number' ? Math.max(byLength, options) : byLength;
    set({ message, durationMs, action });
  },
  hide: () => set({ message: null, action: null }),
  setRoom: (room) => set((s) => ({ room: { ...s.room, ...room } })),

  reset: () =>
    set({ message: null, durationMs: toastDuration('', false), action: null, room: NO_ROOM }),
}));
