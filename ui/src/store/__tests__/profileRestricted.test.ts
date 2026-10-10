/**
 * Someone's workouts you can't see because of their Controls (20261008170000_private_accounts):
 * `get_user_posts` says why (`restricted`), and the profile shows that instead of a grid.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
const getUserPosts = jest.fn();
jest.mock('@/api', () => ({ getUserPosts: (...a: unknown[]) => getUserPosts(...a) }));

import { PROFILE } from '@/constants/tokens';
import { useProfilePostsStore } from '@/store/profilePostsStore';

// One full read of a profile's grid: whole rows of squares.
const PAGE = PROFILE.gridColumns * PROFILE.gridPageRows;

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

// Tagged people see the post (owner, 2026-10-08): a restricted answer can still carry posts.
it('keeps the posts a restricted answer carries, and pages them as usual', async () => {
  const posts = Array.from({ length: PAGE }, (_, i) => ({
    id: `p${i + 1}`,
    created_at: `2026-10-01T00:00:${String(i).padStart(2, '0')}Z`,
  }));
  getUserPosts.mockResolvedValue({ data: posts, error: null, restricted: 'private' });
  await useProfilePostsStore.getState().sync('sam');
  const s = useProfilePostsStore.getState();
  expect(s.restricted).toBe('private');
  expect(s.posts.map((p) => p.id)).toEqual(posts.map((p) => p.id));
  // A full read means there may be more.
  expect(s.hasMore).toBe(true);
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
