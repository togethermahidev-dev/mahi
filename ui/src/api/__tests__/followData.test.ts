const rpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getFollowData } from '@/api/follows';
import { followButtonLabel } from '@/lib/followBack';

describe('getFollowData', () => {
  it('reads follows_you, and false from a server without it', async () => {
    rpc.mockResolvedValue({
      data: [{ is_following: false, follower_count: 1, following_count: 2, follows_you: true }],
      error: null,
    });
    expect((await getFollowData('a', 'b')).data?.follows_you).toBe(true);
    rpc.mockResolvedValue({
      data: [{ is_following: false, follower_count: 1, following_count: 2 }],
      error: null,
    });
    expect((await getFollowData('a', 'b')).data?.follows_you).toBe(false);
  });
});

describe('followButtonLabel', () => {
  it('Follow back only when they follow you and you do not follow them', () => {
    expect(followButtonLabel(false, true)).toEqual({ label: 'Follow back', followsYou: true });
    expect(followButtonLabel(false, false)).toEqual({ label: 'Follow', followsYou: false });
    expect(followButtonLabel(true, true)).toEqual({ label: 'Following', followsYou: false });
  });
});
