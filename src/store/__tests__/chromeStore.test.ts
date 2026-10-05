/**
 * What floats over the pages: holding a post hides it all, and full-screen views over a page
 * hide the glass bar.
 */
import { useChromeStore } from '@/store/chromeStore';

const state = () => useChromeStore.getState();

beforeEach(() => state().reset());

describe('hold to view', () => {
  it('holding a post hides everything over it, letting go brings it back', () => {
    expect(state().viewing).toBe(false);
    state().setViewing(true);
    expect(state().viewing).toBe(true);
    state().setViewing(false);
    expect(state().viewing).toBe(false);
  });
});

describe('views that cover the glass bar', () => {
  it('the bar hides while any of them is open', () => {
    const closeA = state().cover();
    const closeB = state().cover();
    expect(state().covers).toBe(2);
    closeA();
    expect(state().covers).toBe(1);
    closeB();
    expect(state().covers).toBe(0);
  });

  it('closing the same view twice counts once', () => {
    const close = state().cover();
    state().cover();
    close();
    close();
    expect(state().covers).toBe(1);
  });
});

describe('sign-out', () => {
  it('reset clears it all', () => {
    state().setViewing(true);
    state().cover();
    state().reset();
    expect(state()).toMatchObject({ viewing: false, covers: 0 });
  });
});

// Pinch to zoom on a post (founder, 2026-10-05): the list and the page swipes hold still while
// a photo is pinched, and everything over it fades as when held.
describe('pinch to zoom', () => {
  it('zooming holds the pages still until the pinch ends', () => {
    expect(state().zooming).toBe(false);
    state().setZooming(true);
    expect(state().zooming).toBe(true);
    state().setZooming(false);
    expect(state().zooming).toBe(false);
  });

  it('a reset (signing out) ends it', () => {
    state().setZooming(true);
    state().reset();
    expect(state().zooming).toBe(false);
  });
});
