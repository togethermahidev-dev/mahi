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
