/**
 * The post viewer opens a profile's posts, most of which are not in the feed. Liking or commenting
 * on one there must move its numbers too, not only for posts the feed holds.
 */
jest.mock('@/api', () => ({
  toggleLike: jest.fn(),
  addComment: jest.fn(),
  getComments: jest.fn(),
  getFeed: jest.fn(),
  getUserPosts: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { removeChannel: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

import * as api from '@/api';
import { useSocialStore } from '@/store/socialStore';
import { useFeedStore } from '@/store/feedStore';
import { useProfilePostsStore } from '@/store/profilePostsStore';

type ProfilePost = ReturnType<typeof useProfilePostsStore.getState>['posts'][number];
const profilePost = (id: string, like_count: number, comment_count: number) =>
  ({ id, like_count, comment_count }) as ProfilePost;

const mocked = api as jest.Mocked<typeof api>;
const profile = { id: 'me', username: 'me', display_name: null, avatar_url: null };

beforeEach(() => {
  jest.clearAllMocks();
  useSocialStore.getState().reset();
  useFeedStore.getState().reset();
  useProfilePostsStore.getState().reset();
  useProfilePostsStore.setState({ userId: 'friend', posts: [profilePost('p', 5, 2)] });
});

const onProfile = () => useProfilePostsStore.getState().posts[0];

describe('likes and comments on a post that is only on a profile', () => {
  it('a like adds one straight away, then takes the server number', async () => {
    mocked.toggleLike.mockResolvedValue({ data: { liked: true, like_count: 7 }, error: null });
    const done = useSocialStore.getState().toggleLike('p', 'me');
    expect(onProfile().like_count).toBe(6);
    await done;
    expect(onProfile().like_count).toBe(7);
  });

  it('a like that fails goes back', async () => {
    mocked.toggleLike.mockResolvedValue({ data: null, error: new Error('offline') });
    await useSocialStore.getState().toggleLike('p', 'me');
    expect(onProfile().like_count).toBe(5);
  });

  it('a comment adds one, and a failed one goes back', async () => {
    mocked.addComment.mockResolvedValueOnce({
      data: {
        id: 'c1',
        post_id: 'p',
        user_id: 'me',
        content: 'nice',
        created_at: '',
        profiles: profile,
      },
      error: null,
    } as Awaited<ReturnType<typeof api.addComment>>);
    await useSocialStore.getState().addComment('p', 'me', 'nice', profile);
    expect(onProfile().comment_count).toBe(3);

    mocked.addComment.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await useSocialStore.getState().addComment('p', 'me', 'again', profile);
    expect(onProfile().comment_count).toBe(3);
  });
});
