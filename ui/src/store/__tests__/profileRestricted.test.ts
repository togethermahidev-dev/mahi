/**
 * Someone's workouts you can't see because of their Controls (20261008170000_private_accounts):
 * `get_user_posts` says why (`restricted`), and the profile shows that instead of a grid.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
const getUserPosts = jest.fn();
jest.mock('@/api', () => ({ getUserPosts: (...a: unknown[]) => getUserPosts(...a) }));

import { useProfilePostsStore } from '@/store/profilePostsStore';

beforeEach(() => {
  jest.clearAllMocks();
  useProfilePostsStore.getState().reset();
});

it('keeps why the workouts are hidden', async () => {
  getUserPosts.mockResolvedValue({ data: [], error: null, restricted: 'followers' });
  await useProfilePostsStore.getState().sync('sam');
  expect(useProfilePostsStore.getState().restricted).toBe('followers');
  // Nothing more to load from a hidden grid.
  expect(useProfilePostsStore.getState().hasMore).toBe(false);
});

it('a profile you can see has no restriction', async () => {
  getUserPosts.mockResolvedValue({ data: [], error: null, restricted: null });
  await useProfilePostsStore.getState().sync('sam');
  expect(useProfilePostsStore.getState().restricted).toBeNull();
});

it('opening someone else forgets the last person’s restriction at once', async () => {
  getUserPosts.mockResolvedValue({ data: [], error: null, restricted: 'private' });
  await useProfilePostsStore.getState().sync('sam');
  getUserPosts.mockReturnValue(new Promise(() => {}));
  void useProfilePostsStore.getState().sync('alex');
  expect(useProfilePostsStore.getState().restricted).toBeNull();
});
