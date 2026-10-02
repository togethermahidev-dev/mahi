import {
  backdropOpacity,
  clampPan,
  clampZoom,
  doubleTapZoom,
  openablePosts,
  swipeCloses,
  viewerStartIndex,
} from '../viewer';
import { VIEWER } from '@/constants/tokens';

const post = (id: string, image_url = `https://x/${id}.jpg`) => ({ id, image_url });

describe('post viewer: which posts and where it starts', () => {
  it('shows only the posts the grid lets you open (a locked post has no photo link)', () => {
    const posts = [post('a'), post('b', ''), post('c')];
    expect(openablePosts(posts).map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('starts on the tapped post', () => {
    const posts = [post('a'), post('b'), post('c')];
    expect(viewerStartIndex(posts, 'c')).toBe(2);
    expect(viewerStartIndex(posts, 'a')).toBe(0);
  });

  it('starts on the first post when the tapped one is gone', () => {
    expect(viewerStartIndex([post('a'), post('b')], 'zzz')).toBe(0);
    expect(viewerStartIndex([], 'a')).toBe(0);
  });
});

describe('close swipe', () => {
  it('a short slow drag springs back', () => {
    expect(swipeCloses(VIEWER.closeDistance - 1, VIEWER.closeVelocity - 1)).toBe(false);
    expect(swipeCloses(0, 0)).toBe(false);
  });

  it('a long drag closes, either way', () => {
    expect(swipeCloses(VIEWER.closeDistance + 1, 0)).toBe(true);
    expect(swipeCloses(-(VIEWER.closeDistance + 1), 0)).toBe(true);
  });

  it('a quick flick closes, either way', () => {
    expect(swipeCloses(10, VIEWER.closeVelocity + 1)).toBe(true);
    expect(swipeCloses(-10, -(VIEWER.closeVelocity + 1))).toBe(true);
  });

  it('the background fades as the finger moves away, never below clear', () => {
    expect(backdropOpacity(0)).toBe(1);
    expect(backdropOpacity(VIEWER.fadeDistance / 2)).toBeCloseTo(0.5);
    expect(backdropOpacity(-VIEWER.fadeDistance / 2)).toBeCloseTo(0.5);
    expect(backdropOpacity(VIEWER.fadeDistance * 3)).toBe(0);
  });
});

describe('profile picture zoom', () => {
  it('a pinch stays between fitted and the most zoom', () => {
    expect(clampZoom(0.3)).toBe(VIEWER.zoomMin);
    expect(clampZoom(VIEWER.zoomMax + 3)).toBe(VIEWER.zoomMax);
    expect(clampZoom(2)).toBe(2);
  });

  it('a double tap zooms in, and a second one goes back to fitted', () => {
    expect(doubleTapZoom(1)).toBe(VIEWER.zoomDoubleTap);
    expect(doubleTapZoom(1.8)).toBe(VIEWER.zoomMin);
  });

  it('a zoomed photo moves only as far as its edges', () => {
    // A 300px photo at 2x is 600px: it may move 150px each way.
    expect(clampPan(500, 2, 300)).toBe(150);
    expect(clampPan(-500, 2, 300)).toBe(-150);
    expect(clampPan(40, 2, 300)).toBe(40);
    // Fitted, it doesn't move at all.
    expect(clampPan(40, 1, 300)).toBe(0);
  });
});
