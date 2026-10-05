/**
 * The app-wide toast: how long it stays, its one optional button, and where it sits.
 */
import { useToastStore } from '@/store/toastStore';
import { WAIT } from '@/constants/tokens';

const state = () => useToastStore.getState();

beforeEach(() => state().reset());

describe('showing a toast', () => {
  it('stays by its length, with no button', () => {
    state().show('Couldn’t open sharing. Try again.');
    expect(state().message).toBe('Couldn’t open sharing. Try again.');
    expect(state().durationMs).toBe(WAIT.toastMin);
    expect(state().action).toBeNull();
  });

  it('can carry one button, and then stays long enough to reach it', () => {
    const onPress = jest.fn();
    state().show('Couldn’t like that post.', { action: { label: 'Try again', onPress } });
    expect(state().action?.label).toBe('Try again');
    expect(state().durationMs).toBe(WAIT.toastAction);
  });

  it('an older caller’s wait is the least it stays', () => {
    state().show('Posted.', WAIT.toastLong);
    expect(state().durationMs).toBe(WAIT.toastLong);
  });

  it('a new toast drops the last one’s button', () => {
    state().show('Couldn’t like that post.', {
      action: { label: 'Try again', onPress: jest.fn() },
    });
    state().show('Posted.');
    expect(state().action).toBeNull();
  });
});

describe('where it sits', () => {
  it('above the tab bar, and at the top while the post preview is up', () => {
    expect(state().room).toEqual({ tabBar: 0, top: false });
    state().setRoom({ tabBar: 83 });
    state().setRoom({ top: true });
    expect(state().room).toEqual({ tabBar: 83, top: true });
  });
});
