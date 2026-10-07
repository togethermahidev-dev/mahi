/**
 * A new post goes to the top of your profile grid. There's no daily limit any more, so two posts
 * on the same day both stay; only a retry of the same post (same id) replaces it.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/api', () => ({
  getUserPosts: jest.fn(),
}));

import { useProfilePostsStore } from '@/store/profilePostsStore';

type Post = Parameters<ReturnType<typeof useProfilePostsStore.getState>['addPost']>[0];
const post = (id: string, created_at: string) => ({ id, created_at }) as Post;

beforeEach(() => useProfilePostsStore.getState().reset());

describe('addPost', () => {
  it('keeps two posts made on the same day, newest first', () => {
    const { addPost } = useProfilePostsStore.getState();
    addPost(post('a', '2026-10-01T08:00:00.000Z'));
    addPost(post('b', '2026-10-01T18:00:00.000Z'));
    expect(useProfilePostsStore.getState().posts.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('a retry of the same post replaces it instead of showing it twice', () => {
    const { addPost } = useProfilePostsStore.getState();
    addPost(post('a', '2026-10-01T08:00:00.000Z'));
    addPost(post('a', '2026-10-01T08:00:00.000Z'));
    expect(useProfilePostsStore.getState().posts.map((p) => p.id)).toEqual(['a']);
  });
});
