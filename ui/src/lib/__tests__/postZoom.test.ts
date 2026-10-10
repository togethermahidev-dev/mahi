import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Pinch to zoom on a post (owner, 2026-10-10: "Can't zoom in on the feed images when should be
 * able to"). The pinch moved an empty view: wherever hold to preview runs (every iPhone build
 * with it, since 2026-10-06) the photo was drawn in a second view the pinch never touched, so two
 * fingers faded the name and caption and held the list, but the photo stayed the same size.
 * These read PostCard's source, like the design-token tests: nothing here can render a post.
 */
const source = readFileSync(join(__dirname, '..', '..', 'components', 'PostCard.tsx'), 'utf8');
/** Whether PostCard's source has this (a yes/no, so a failure doesn't print the whole file). */
const has = (pattern: RegExp) => pattern.test(source);

describe('pinch to zoom on a post', () => {
  it('draws the photo once, inside the view the pinch moves', () => {
    expect(source.match(/\{media\}/g) ?? []).toHaveLength(1);
    expect(has(/zoomStyle\]\}[^>]*>\s*\{media\}\s*<\/Reanimated\.View>/)).toBe(true);
  });

  it('never draws the photo somewhere the pinch doesn’t reach, with hold to preview on or off', () => {
    expect(has(/[?:]\s*media\s*[}):]/)).toBe(false);
  });

  it('takes the pinch outside the hold-to-preview host, like the list’s own scrolling', () => {
    const pinch = source.indexOf('<GestureDetector gesture={pinch}>');
    const host = source.indexOf('<PreviewMenu');
    expect(pinch).toBeGreaterThan(-1);
    expect(host).toBeGreaterThan(pinch);
    // …so it is no longer one of the gestures inside the host.
    expect(has(/Gesture\.Simultaneous\([^)]*\bpinch\b/)).toBe(false);
  });

  it('runs alongside the list and the post’s own taps', () => {
    expect(has(/pinch\.simultaneousWithExternalGesture\(/)).toBe(true);
  });
});
