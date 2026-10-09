/**
 * FEED over the shutter (owner, 2026-10-09): "^ FEED ^" with the arrows rising, so you know to
 * swipe up for your feed. When it shows, and where it sits beside the camera's small window.
 */
import { feedCueLeft, feedCueShows } from '@/lib/feedCue';
import { SPACE } from '@/constants/tokens';

const live = {
  gate: 'open',
  captureState: 'idle',
  previewOpen: false,
  feedShown: false,
  drawerOpen: false,
} as const;

describe('feedCueShows — when FEED shows over the shutter', () => {
  it('shows on the live camera before the first shot', () => {
    expect(feedCueShows(live)).toBe(true);
  });

  it('shows on the locked camera, over the locked shutter, while you wait for a tag', () => {
    expect(feedCueShows({ ...live, gate: 'closed' })).toBe(true);
  });

  it('hides while your tags are checked (or there is no connection): there is no shutter', () => {
    expect(feedCueShows({ ...live, gate: 'loading' })).toBe(false);
  });

  it.each(['capturing-first', 'switching', 'awaiting-second', 'capturing-second'] as const)(
    'hides while a shot is under way (%s)',
    (captureState) => {
      expect(feedCueShows({ ...live, captureState })).toBe(false);
    }
  );

  it('hides over the preview, while the feed is up and while the pull-down drawer is open', () => {
    expect(feedCueShows({ ...live, previewOpen: true })).toBe(false);
    expect(feedCueShows({ ...live, feedShown: true })).toBe(false);
    expect(feedCueShows({ ...live, drawerOpen: true })).toBe(false);
  });
});

describe('feedCueLeft — centred over the shutter, never over the small window', () => {
  const cue = { pageWidth: 390, cueWidth: 84 };

  it('is centred when the small window is out of the way', () => {
    expect(feedCueLeft({ ...cue, clearOf: 0 })).toBe(153);
  });

  it('stays centred when there is room beside the small window', () => {
    expect(feedCueLeft({ ...cue, clearOf: 146 })).toBe(153);
  });

  it('steps right, just past the small window, when centred would cover it', () => {
    expect(feedCueLeft({ ...cue, clearOf: 200 })).toBe(200 + SPACE.s4);
  });
});
