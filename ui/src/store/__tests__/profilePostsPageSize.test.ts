/**
 * A profile's grid is three across (owner, 2026-10-10), so one read brings whole rows and enough
 * of them to fill the first screen in one go: nine squares show without scrolling.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/api', () => ({
  getUserPosts: jest.fn(),
}));

import { getUserPosts } from '@/api';
import { PROFILE } from '@/constants/tokens';
import { useProfilePostsStore } from '@/store/profilePostsStore';

const read = getUserPosts as jest.Mock;

beforeEach(() => {
  useProfilePostsStore.getState().reset();
  read.mockReset();
  read.mockResolvedValue({ data: [], error: null, restricted: null });
});

describe('how many posts one read brings', () => {
  it('fills the first screen in one read: whole rows, nine squares or more', async () => {
    await useProfilePostsStore.getState().sync('u1');
    const size = read.mock.calls[0][1] as number;
    expect(size % PROFILE.gridColumns).toBe(0);
    expect(size).toBeGreaterThanOrEqual(PROFILE.gridColumns * 3);
    expect(size).toBe(PROFILE.gridColumns * PROFILE.gridPageRows);
  });
});
