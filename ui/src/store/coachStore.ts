import type { RefObject } from 'react';
import type { View } from 'react-native';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { coachSeenKey, parseSeenTips, serializeSeenTips, type CoachTipId } from '@/lib/coachMarks';

/**
 * The one-time tips (rules: src/lib/coachMarks.ts; the bubble: src/components/CoachMark.tsx).
 * - `anchors`: the things on screen that want their tip now (useCoachAnchor).
 * - `blocks`: things a tip must never sit over or collide with (welcome cards, the notifications
 *   page, the point celebration, a sheet over the pages); see useCoachBlock.
 * - `page`, `composing`: which swipe page is up, and whether the post preview covers it.
 * - `seen`: tips this account closed on this device (null until read). Kept on the device: a
 *   seen mark never expires.
 * - `current`: the tip on screen, so it stays until closed rather than swapping.
 */
interface CoachState {
  anchors: Partial<Record<CoachTipId, RefObject<View | null>>>;
  blocks: number;
  page: string;
  composing: boolean;
  seen: CoachTipId[] | null;
  seenFor: string | null;
  current: CoachTipId | null;
  /** The thing a tip points at is on screen and the tip makes sense now. Call what it returns
   * when that stops. */
  anchor: (tip: CoachTipId, ref: RefObject<View | null>) => () => void;
  /** Something a tip must not show over opened. Call what it returns when it closes. */
  block: () => () => void;
  setPage: (page: string) => void;
  setComposing: (composing: boolean) => void;
  setCurrent: (tip: CoachTipId | null) => void;
  /** Reads this account's closed tips (once per account). */
  loadSeen: (userId: string) => void;
  /** The tip was closed: never again for this account on this device. */
  markSeen: (tip: CoachTipId) => void;
}

export const useCoachStore = create<CoachState>((set, get) => ({
  anchors: {},
  blocks: 0,
  page: '',
  composing: false,
  seen: null,
  seenFor: null,
  current: null,

  anchor: (tip, ref) => {
    set((s) => ({ anchors: { ...s.anchors, [tip]: ref } }));
    return () => {
      if (get().anchors[tip] !== ref) return;
      set((s) => {
        const anchors = { ...s.anchors };
        delete anchors[tip];
        return { anchors };
      });
    };
  },

  block: () => {
    set((s) => ({ blocks: s.blocks + 1 }));
    let open = true;
    return () => {
      if (!open) return;
      open = false;
      set((s) => ({ blocks: Math.max(0, s.blocks - 1) }));
    };
  },

  setPage: (page) => {
    if (get().page !== page) set({ page });
  },
  setComposing: (composing) => {
    if (get().composing !== composing) set({ composing });
  },
  setCurrent: (current) => {
    if (get().current !== current) set({ current });
  },

  loadSeen: (userId) => {
    if (get().seenFor === userId) return;
    set({ seen: null, seenFor: userId, current: null });
    AsyncStorage.getItem(coachSeenKey(userId))
      .then((raw) => {
        if (get().seenFor === userId) set({ seen: parseSeenTips(raw) });
      })
      // Can't read: show the tips (at worst one shows again).
      .catch(() => {
        if (get().seenFor === userId) set({ seen: [] });
      });
  },

  markSeen: (tip) => {
    const { seen, seenFor } = get();
    const next = seen?.includes(tip) ? seen : [...(seen ?? []), tip];
    set({ seen: next, current: null });
    if (!seenFor) return;
    // Failing to save only means the tip shows once more.
    AsyncStorage.setItem(coachSeenKey(seenFor), serializeSeenTips(next)).catch(() => {});
  },
}));
