/**
 * Camera to feed morph (owner, 2026-10-09): as the finger swipes the open feed up, the camera
 * minimises into a small rounded card going up and out, and the feed comes in as a card that
 * maximises to exactly full screen — both squashed mid-swipe, like the drawer and the tab morph.
 */
import { cameraFeedMorph } from '@/lib/cameraFeedMorph';
import { MOTION } from '@/constants/tokens';

const H = 800;
const peek = MOTION.cameraFeed.peekShare;
const { cameraToScale, cameraFadeFrom, feedFromScale, feedFromY } = MOTION.cameraFeed;
const radius = MOTION.pageMorph.fromRadius;
/** Where the camera's lower edge sits on the screen. */
const cameraBottom = (c: { scale: number; translateY: number }) =>
  H / 2 + c.translateY + (c.scale * H) / 2;

describe('cameraFeedMorph — the camera minimises as the feed maximises', () => {
  it('on the camera: the camera is full screen and square; the feed is a small hidden card', () => {
    const { camera, feed } = cameraFeedMorph(0, H, false);
    expect(camera).toEqual({ scale: 1, translateY: 0, borderRadius: 0, opacity: 1 });
    expect(feed).toEqual({
      scale: feedFromScale,
      translateY: feedFromY * H,
      borderRadius: radius,
      opacity: 0,
    });
  });

  it('fully open: the feed is exactly full screen, square and solid; the camera is gone', () => {
    const { camera, feed } = cameraFeedMorph(1, H, false);
    expect(feed).toEqual({ scale: 1, translateY: 0, borderRadius: 0, opacity: 1 });
    expect(camera.scale).toBe(cameraToScale);
    expect(camera.borderRadius).toBe(radius);
    expect(camera.opacity).toBe(0);
    expect(cameraBottom(camera)).toBeCloseTo(0);
  });

  it('mid-swipe both are squashed: smaller than the screen and rounded', () => {
    const { camera, feed } = cameraFeedMorph(0.5, H, false);
    for (const card of [camera, feed]) {
      expect(card.scale).toBeLessThan(1);
      expect(card.borderRadius).toBeGreaterThan(0);
    }
    expect(camera.translateY).toBeLessThan(0);
    expect(feed.translateY).toBeGreaterThan(0);
  });

  it('the camera’s lower edge follows the finger, so the peek shows the same share as before', () => {
    expect(cameraBottom(cameraFeedMorph(peek, H, false).camera)).toBeCloseTo(H * (1 - peek));
    expect(cameraBottom(cameraFeedMorph(0.5, H, false).camera)).toBeCloseTo(H / 2);
  });

  it('the feed is solid by the peek; the camera only fades near the end', () => {
    expect(cameraFeedMorph(peek, H, false).feed.opacity).toBe(1);
    expect(cameraFeedMorph(peek / 2, H, false).feed.opacity).toBeCloseTo(0.5);
    expect(cameraFeedMorph(cameraFadeFrom, H, false).camera.opacity).toBe(1);
    expect(cameraFeedMorph((cameraFadeFrom + 1) / 2, H, false).camera.opacity).toBeCloseTo(0.5);
  });

  it('clamps a spring overshoot past either end', () => {
    expect(cameraFeedMorph(-0.2, H, false)).toEqual(cameraFeedMorph(0, H, false));
    expect(cameraFeedMorph(1.2, H, false)).toEqual(cameraFeedMorph(1, H, false));
  });
});

describe('cameraFeedMorph — Reduce Motion: a slide and a cross-fade, no scaling', () => {
  it('nothing scales or rounds at any point', () => {
    for (const p of [0, peek, 0.5, 1]) {
      const { camera, feed } = cameraFeedMorph(p, H, true);
      expect(camera.scale).toBe(1);
      expect(feed.scale).toBe(1);
      expect(camera.borderRadius).toBe(0);
      expect(feed.borderRadius).toBe(0);
      expect(feed.translateY).toBe(0);
    }
  });

  it('the camera slides up with the finger while the feed fades in under it', () => {
    expect(cameraFeedMorph(peek, H, true).camera.translateY).toBeCloseTo(-peek * H);
    expect(cameraFeedMorph(peek, H, true).feed.opacity).toBe(1);
    expect(cameraFeedMorph(1, H, true).feed).toEqual({
      scale: 1,
      translateY: 0,
      borderRadius: 0,
      opacity: 1,
    });
  });
});
