/**
 * A comment that fails to send: the comment comes back out of the list and a toast says so in the
 * button's own word, "send" ("post" is for workouts; design round 5 wording sweep).
 */
jest.mock('@/api', () => ({
  toggleLike: jest.fn(),
  addComment: jest.fn(),
  getComments: jest.fn(),
  getCommentLikes: jest.fn(),
  toggleCommentLike: jest.fn(),
  getCommentLikers: jest.fn(),
  getFeed: jest.fn(),
  getUserPosts: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { removeChannel: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

import * as api from '@/api';
import { useSocialStore } from '@/store/socialStore';
import { useToastStore } from '@/store/toastStore';

const mocked = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
  useSocialStore.getState().reset();
  useToastStore.getState().reset();
});

it('a comment that fails to send says "Couldn’t send your comment" and leaves the list as it was', async () => {
  mocked.addComment.mockResolvedValue({ data: null, error: new Error('offline') });
  await useSocialStore.getState().addComment('p', 'u', 'Nice one', {
    username: 'me',
    avatar_url: null,
  } as never);
  expect(useToastStore.getState().message).toBe(
    'Couldn’t send your comment. Your words are still in the box.'
  );
  expect(useSocialStore.getState().comments.p ?? []).toEqual([]);
});
