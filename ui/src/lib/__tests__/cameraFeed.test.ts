/**
 * One screen for the camera and the feed (owner, 2026-10-08): swipe the camera up and it shrinks
 * into a small card at the top while the feed takes the screen; tap the card, the Camera pill or
 * swipe it down and the camera is back. Pure geometry and release rules, unit-tested.
 */
import { cameraCard, feedOpensOnRelease, feedTop } from '@/lib/cameraFeed';

const page = { width: 400, height: 800 };

describe('cameraCard — the small camera when the feed is showing', () => {
  it('keeps the camera’s shape at a third of its width, under the header on the left', () => {
    const card = cameraCard(page, 100);
    expect(card.scale).toBe(0.32);
    expect(card).toEqual({ x: 16, y: 108, width: 128, height: 256, scale: 0.32 });
  });
});

describe('feedTop — where the feed’s rows start', () => {
  it('is just under the camera card', () => {
    expect(feedTop(cameraCard(page, 100))).toBe(108 + 256 + 8);
  });
});

describe('feedOpensOnRelease — an upward swipe past a quarter of the way, or a flick', () => {
  const travel = 500;
  it('opens past a quarter of the travel', () => {
    expect(feedOpensOnRelease({ progress: 0.3, velocity: 0, travel, startedOpen: false })).toBe(true);
    expect(feedOpensOnRelease({ progress: 0.1, velocity: 0, travel, startedOpen: false })).toBe(false);
  });
  it('a flick up opens from anywhere; a flick down closes', () => {
    expect(feedOpensOnRelease({ progress: 0.05, velocity: -2, travel, startedOpen: false })).toBe(true);
    expect(feedOpensOnRelease({ progress: 0.9, velocity: 2, travel, startedOpen: true })).toBe(false);
  });
  it('from open, closes only past a quarter of the way back', () => {
    expect(feedOpensOnRelease({ progress: 0.8, velocity: 0, travel, startedOpen: true })).toBe(true);
    expect(feedOpensOnRelease({ progress: 0.7, velocity: 0, travel, startedOpen: true })).toBe(false);
  });
});
