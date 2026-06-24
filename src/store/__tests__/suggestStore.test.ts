/**
 * Optimistic-follow tests for suggestStore.
 *
 * `@/api` is auto-mocked so importing the store never pulls in the real follows
 * API (and therefore not `@/lib/supabase`, which loads RN-only native modules
 * that can't run in this node test environment). The actual follow is delegated
 * to followStore.toggleFollow, which we stub on the real store instance.
 */
jest.mock('@/api', () => ({
  getSuggestedFollows: jest.fn(),
}));

// followStore imports the real supabase client (RN-only native modules). Stub it
// so importing the store graph stays in a plain node environment.
jest.mock('@/lib/supabase', () => ({ supabase: { channel: jest.fn(), removeChannel: jest.fn() } }));

import { useSuggestStore } from '@/store/suggestStore';
import { useFollowStore } from '@/store/followStore';

const userA = { id: 'a', username: 'a', display_name: 'A', avatar_url: null };
const userB = { id: 'b', username: 'b', display_name: 'B', avatar_url: null };

beforeEach(() => {
  useSuggestStore.getState().reset();
  useSuggestStore.setState({ suggestions: [userA, userB] });
});

describe('followSuggested (optimistic remove)', () => {
  it('removes the followed user from the strip on success', async () => {
    jest
      .spyOn(useFollowStore.getState(), 'toggleFollow')
      .mockResolvedValue({ error: null });

    await useSuggestStore.getState().followSuggested('me', 'a');

    const ids = useSuggestStore.getState().suggestions.map((u) => u.id);
    expect(ids).toEqual(['b']); // userA removed, userB untouched
  });

  it('rolls the removal back when the follow fails', async () => {
    jest
      .spyOn(useFollowStore.getState(), 'toggleFollow')
      .mockResolvedValue({ error: new Error('network') });

    const { error } = await useSuggestStore.getState().followSuggested('me', 'a');

    expect(error).toBeInstanceOf(Error);
    // RED for a naive impl that doesn't roll back: strip would be ['b'].
    const ids = useSuggestStore.getState().suggestions.map((u) => u.id);
    expect(ids).toEqual(['a', 'b']); // restored to original
  });
});
