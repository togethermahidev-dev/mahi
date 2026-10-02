/**
 * Rules for the two full-screen viewers: a profile's posts (PostViewer — up/down browses,
 * a sideways swipe closes) and a profile picture (AvatarViewer — pinch to zoom, swipe to close).
 * Pure so they can be unit-tested; the gesture ones are worklets, called on the UI thread.
 * Distances in px, speeds in px per second (as gesture-handler reports them).
 */
import { VIEWER } from '@/constants/tokens';

/**
 * The posts the viewer pages through: the ones a grid square opens. Another person's post comes
 * back with no photo link while the feed lock hides it, and stays shut (the grid's rule).
 */
export function openablePosts<T extends { image_url: string }>(posts: T[]): T[] {
  return posts.filter((p) => !!p.image_url);
}

/** Where the viewer opens: the tapped post, or the first one if it has gone. */
export function viewerStartIndex(posts: { id: string }[], postId: string): number {
  return Math.max(0, posts.findIndex((p) => p.id === postId));
}

/** A close swipe (either way) closes past the distance or when flicked fast enough. */
export function swipeCloses(distance: number, velocity: number): boolean {
  'worklet';
  return Math.abs(distance) > VIEWER.closeDistance || Math.abs(velocity) > VIEWER.closeVelocity;
}

/** The dark background while dragging to close: solid at rest, clear once far enough away. */
export function backdropOpacity(distance: number): number {
  'worklet';
  return Math.max(0, 1 - Math.abs(distance) / VIEWER.fadeDistance);
}

/** A pinch stays between fitted and the most zoom. */
export function clampZoom(scale: number): number {
  'worklet';
  return Math.min(VIEWER.zoomMax, Math.max(VIEWER.zoomMin, scale));
}

/** Double tap: zoom in from fitted; anything zoomed goes back to fitted. */
export function doubleTapZoom(scale: number): number {
  'worklet';
  return scale > VIEWER.zoomMin ? VIEWER.zoomMin : VIEWER.zoomDoubleTap;
}

/** A zoomed photo of `size` px moves only until its edge meets the edge of where it sat. */
export function clampPan(offset: number, scale: number, size: number): number {
  'worklet';
  const max = (size * (scale - 1)) / 2;
  if (max <= 0) return 0;
  return Math.min(max, Math.max(-max, offset));
}
