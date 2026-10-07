const rpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getFollowData, setFollowing } from '@/api/follows';
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

describe('setFollowing', () => {
  it('returns the authoritative state from the mutation RPC', async () => {
    const answer = {
      is_following: true,
      follower_count: 4,
      following_count: 3,
      follows_you: false,
      current_following_count: 7,
    };
    rpc.mockResolvedValue({ data: [answer], error: null });

    await expect(setFollowing('target', true)).resolves.toEqual({ data: answer, error: null });
    expect(rpc).toHaveBeenLastCalledWith('set_following', {
      p_target_user_id: 'target',
      p_following: true,
    });
  });
});

describe('followButtonLabel', () => {
  it('Follow back only when they follow you and you do not follow them', () => {
    expect(followButtonLabel(false, true)).toEqual({ label: 'Follow back', followsYou: true });
    expect(followButtonLabel(false, false)).toEqual({ label: 'Follow', followsYou: false });
    expect(followButtonLabel(true, true)).toEqual({ label: 'Following', followsYou: false });
  });
});
