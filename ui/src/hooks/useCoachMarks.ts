import { useEffect, useRef } from 'react';
import { AppState, type View } from 'react-native';
import { useCoachStore } from '@/store/coachStore';
import { useToastStore } from '@/store/toastStore';
import { useTagStore } from '@/store';
import { openTagReminder } from '@/lib/openTagsBanner';
import type { CoachTipId } from '@/lib/coachMarks';

/**
 * The thing a one-time tip points at. Put the returned ref on it; while `active` (it's on screen
 * and the tip makes sense now) the tip may show, once the page is clear (CoachMarkHost).
 */
export function useCoachAnchor(tip: CoachTipId, active: boolean) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!active) return;
    return useCoachStore.getState().anchor(tip, ref);
  }, [tip, active]);
  return ref;
}

/** While `on`, no tip shows (and the tag reminder waits): a page, sheet or moment is up. */
export function useCoachBlock(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    return useCoachStore.getState().block();
  }, [on]);
}

/**
 * The in-app nudge when Mahi opens with a tag waiting (push is off): a short toast, "@sam’s tag:
 * 05:12:33 left", at most once each time Mahi comes to the front, only away from the camera, and
 * never over a tip, a sheet or another toast. Rules: `openTagReminder`. With `onAnswer` the
 * toast carries an "Answer" button that goes to the camera (usability walkthrough, 2026-10-07).
 */
export function useOpenTagReminder(onAnswer?: () => void): void {
  const answer = useRef(onAnswer);
  useEffect(() => {
    answer.current = onAnswer;
  });
  const page = useCoachStore((s) => (s.composing ? 'compose' : s.page));
  const busy = useCoachStore((s) => s.blocks > 0 || s.current !== null);
  const toast = useToastStore((s) => s.message !== null);
  const openTags = useTagStore((s) => s.openTags);
  const serverOffsetMs = useTagStore((s) => s.serverOffsetMs);
  // Only this open's fresh read: a tag kept from before the phone slept may have ended.
  const fresh = useTagStore((s) => s.openTagsLoaded && !s.isSyncing);
  const reminded = useRef(false);

  // Each time Mahi comes back to the front counts as a new open.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') reminded.current = false;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const text = openTagReminder({
      openTags,
      serverOffsetMs,
      page,
      quiet: busy || toast || !fresh,
      reminded: reminded.current,
    });
    if (!text) return;
    reminded.current = true;
    useToastStore
      .getState()
      .show(
        text,
        answer.current
          ? { action: { label: 'Answer', onPress: () => answer.current?.() } }
          : undefined
      );
  }, [openTags, serverOffsetMs, page, busy, toast, fresh]);
}
