/**
 * The post viewer's two moves (owner, 2026-10-10: "change it to scroll up/down to go between
 * them and make swiping left or right be able to exit (switch how it currently is)").
 */
import { sidewaysCloses, sidewaysExit, sidewaysProgress, viewerPages } from '@/lib/viewerSwipe';
import { VIEWER } from '@/constants/tokens';

describe('which way the viewer moves', () => {
  it('a profile’s posts page up and down, one per screen', () => {
    expect(viewerPages('profile')).toBe(true);
  });

  it('so does the feed opened from a row', () => {
    expect(viewerPages('feed')).toBe(true);
  });

  it('one post (shared in a chat) doesn’t move up or down at all', () => {
    expect(viewerPages('post')).toBe(false);
  });
});

describe('a sideways swipe closes it', () => {
  const far = VIEWER.closeDistance + 1;
  const fast = VIEWER.closeVelocity + 1;

  it('a short slow drag springs back', () => {
    expect(sidewaysCloses(VIEWER.closeDistance - 1, 0)).toBe(false);
    expect(sidewaysCloses(-(VIEWER.closeDistance - 1), 0)).toBe(false);
    expect(sidewaysCloses(0, 0)).toBe(false);
  });

  it('a long drag closes, to the right or to the left', () => {
    expect(sidewaysCloses(far, 0)).toBe(true);
    expect(sidewaysCloses(-far, 0)).toBe(true);
  });

  it('a quick flick closes, to the right or to the left', () => {
    expect(sidewaysCloses(30, fast)).toBe(true);
    expect(sidewaysCloses(-30, -fast)).toBe(true);
  });

  it('a flick back towards the middle keeps it open, however far it was dragged', () => {
    expect(sidewaysCloses(far * 2, -fast)).toBe(false);
    expect(sidewaysCloses(-far * 2, fast)).toBe(false);
  });

  it('a slow drift back at the end of a long drag still closes', () => {
    expect(sidewaysCloses(far, -(VIEWER.closeVelocity - 1))).toBe(true);
  });
});

describe('the close animation follows the finger', () => {
  it('starts fully open and runs down with the distance, either way', () => {
    expect(sidewaysProgress(0, 400)).toBe(1);
    expect(sidewaysProgress(100, 400)).toBeCloseTo(0.75);
    expect(sidewaysProgress(-100, 400)).toBeCloseTo(0.75);
  });

  it('stays between closed and open', () => {
    expect(sidewaysProgress(900, 400)).toBe(0);
    expect(sidewaysProgress(-900, 400)).toBe(0);
  });

  it('is open when the screen has no width yet', () => {
    expect(sidewaysProgress(50, 0)).toBe(1);
  });

  it('slides off the side it was dragged to', () => {
    expect(sidewaysExit(120, 400)).toBe(400);
    expect(sidewaysExit(-120, 400)).toBe(-400);
  });
});
