/**
 * FEED over the shutter (owner, 2026-10-09): "^ FEED ^" with the arrows rising, so you know to
 * swipe up for your feed. When it shows and where it sits; pure so it can be unit-tested. The cue
 * is src/components/FeedCue.tsx; the camera that places it is src/screens/CameraScreen.tsx.
 */
import { SPACE } from '@/constants/tokens';
import type { CaptureState } from './captureGuide';

/**
 * Whether the cue shows: only over a shutter (the live one, or the locked one while you wait for
 * a tag — none while your tags are checked or there is no connection), before the first shot,
 * and never over the preview, the feed or the open pull-down drawer.
 */
export function feedCueShows(s: {
  gate: 'loading' | 'open' | 'closed';
  captureState: CaptureState;
  /** Both shots are in: the preview covers the camera. */
  previewOpen: boolean;
  /** The feed is up over the camera (its peek or all the way). */
  feedShown: boolean;
  /** The roadmap drawer behind the camera is pulled open. */
  drawerOpen: boolean;
}): boolean {
  return (
    s.gate !== 'loading' &&
    s.captureState === 'idle' &&
    !s.previewOpen &&
    !s.feedShown &&
    !s.drawerOpen
  );
}

/**
 * The cue's left edge: centred over the shutter, unless the small window (bottom left) reaches
 * that far at the cue's height (`clearOf`, its right edge; 0 when it's lower) — then just past it.
 */
export function feedCueLeft(s: { pageWidth: number; cueWidth: number; clearOf: number }): number {
  return Math.max((s.pageWidth - s.cueWidth) / 2, s.clearOf + SPACE.s4);
}
