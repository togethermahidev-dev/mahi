const rpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  getFollowData,
  getFollowRequests,
  removeFollower,
  respondFollowRequest,
  setAccountControls,
  setFollowing,
} from '@/api/follows';
import { followButtonLabel, followErrorText, unfollowConfirm } from '@/lib/followBack';

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

describe('getFollowData (private accounts)', () => {
  it('reads requested and is_private, and false from a server without them', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          is_following: false,
          follower_count: 1,
          following_count: 2,
          follows_you: false,
          requested: true,
          is_private: true,
        },
      ],
      error: null,
    });
    const { data } = await getFollowData('a', 'b');
    expect(data?.requested).toBe(true);
    expect(data?.is_private).toBe(true);
    rpc.mockResolvedValue({
      data: [{ is_following: false, follower_count: 1, following_count: 2 }],
      error: null,
    });
    const old = (await getFollowData('a', 'b')).data;
    expect(old?.requested).toBe(false);
    expect(old?.is_private).toBe(false);
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
      status: 'following',
      is_private: false,
    };
    rpc.mockResolvedValue({ data: [answer], error: null });

    await expect(setFollowing('target', true)).resolves.toEqual({ data: answer, error: null });
    expect(rpc).toHaveBeenLastCalledWith('set_following', {
      p_target_user_id: 'target',
      p_following: true,
    });
  });
});

describe('setFollowing status', () => {
  it('passes a requested answer through', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          is_following: false,
          follower_count: 4,
          following_count: 3,
          follows_you: false,
          current_following_count: 7,
          status: 'requested',
          is_private: true,
        },
      ],
      error: null,
    });
    const { data } = await setFollowing('target', true);
    expect(data?.status).toBe('requested');
    expect(data?.is_private).toBe(true);
  });

  it('reads the status from is_following on a server without it', async () => {
    const row = { follower_count: 4, following_count: 3, current_following_count: 7 };
    rpc.mockResolvedValue({ data: [{ ...row, is_following: true }], error: null });
    expect((await setFollowing('target', true)).data).toMatchObject({
      status: 'following',
      is_private: false,
      follows_you: false,
    });
    rpc.mockResolvedValue({ data: [{ ...row, is_following: false }], error: null });
    expect((await setFollowing('target', false)).data?.status).toBe('none');
  });
});

describe('follow requests and controls (server: 20261008170000_private_accounts)', () => {
  beforeEach(() => rpc.mockReset());

  it('respondFollowRequest sends the requester, the answer and follow back', async () => {
    rpc.mockResolvedValue({ data: { status: 'accepted', follow_back: 'following' }, error: null });
    await expect(respondFollowRequest('r1', true, true)).resolves.toEqual({
      data: { status: 'accepted', follow_back: 'following' },
      error: null,
    });
    expect(rpc).toHaveBeenLastCalledWith('respond_follow_request', {
      p_requester: 'r1',
      p_accept: true,
      p_follow_back: true,
    });
    rpc.mockResolvedValue({ data: { status: 'declined', follow_back: null }, error: null });
    await respondFollowRequest('r1', false);
    expect(rpc).toHaveBeenLastCalledWith('respond_follow_request', {
      p_requester: 'r1',
      p_accept: false,
      p_follow_back: false,
    });
  });

  it('removeFollower names the follower and returns what ended', async () => {
    rpc.mockResolvedValue({ data: { removed: true, tags_ended: 2 }, error: null });
    await expect(removeFollower('f1')).resolves.toEqual({
      data: { removed: true, tags_ended: 2 },
      error: null,
    });
    expect(rpc).toHaveBeenLastCalledWith('remove_follower', { p_follower: 'f1' });
  });

  it('getFollowRequests returns the incoming list', async () => {
    const row = {
      requester_id: 'r1',
      username: 'sam',
      display_name: null,
      avatar_url: null,
      requested_at: '2026-10-08T10:00:00Z',
    };
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect(getFollowRequests()).resolves.toEqual({ data: [row], error: null });
    expect(rpc).toHaveBeenLastCalledWith('get_follow_requests');
  });

  it('setAccountControls sends null for anything unchanged', async () => {
    const answer = {
      is_private: true,
      posts_visibility: 'followers',
      tag_permission: 'approve',
      accepted_requests: 0,
    };
    rpc.mockResolvedValue({ data: answer, error: null });
    await expect(setAccountControls({ is_private: true })).resolves.toEqual({
      data: answer,
      error: null,
    });
    expect(rpc).toHaveBeenLastCalledWith('set_account_controls', {
      p_is_private: true,
      p_posts_visibility: null,
      p_tag_permission: null,
    });
  });

  it('a refusal comes back as an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not allowed' } });
    const { data, error } = await removeFollower('f1');
    expect(data).toBeNull();
    expect(error?.message).toBe('not allowed');
  });
});

// Tagging no longer needs a mutual follow, so the old "You won't be able to tag each other" was
// not always true (supervisor review, 2026-10-08).
describe('unfollowConfirm', () => {
  it('a friend: you stop being friends', () => {
    expect(unfollowConfirm('@sam', { followsYou: true, isPrivate: false })).toEqual({
      title: 'Unfollow @sam?',
      message: 'You’ll stop being friends.',
    });
  });
  it('a private account: you would have to ask again', () => {
    expect(unfollowConfirm('@sam', { followsYou: false, isPrivate: true }).message).toBe(
      'You’ll need to ask again to see their workouts.'
    );
    expect(unfollowConfirm('@sam', { followsYou: true, isPrivate: true }).message).toBe(
      'You’ll stop being friends. You’ll need to ask again to see their workouts.'
    );
  });
  it('anyone else: nothing more to say', () => {
    expect(
      unfollowConfirm('@sam', { followsYou: false, isPrivate: false }).message
    ).toBeUndefined();
  });
});

describe('followErrorText', () => {
  it('the daily cap on follow requests, in plain words', () => {
    expect(
      followErrorText('too many follow requests today', 'Couldn’t follow @sam. Try again.')
    ).toBe('You’ve sent a lot of follow requests today. Try again tomorrow.');
  });
  it('anything else keeps the screen’s own words', () => {
    expect(followErrorText('offline', 'Couldn’t follow @sam. Try again.')).toBe(
      'Couldn’t follow @sam. Try again.'
    );
  });
});

describe('followButtonLabel', () => {
  it('Requested while a follow request waits (a tap takes it back)', () => {
    expect(followButtonLabel(false, false, true)).toEqual({
      label: 'Requested',
      followsYou: false,
    });
    expect(followButtonLabel(false, true, true)).toEqual({ label: 'Requested', followsYou: false });
  });

  it('Follow back only when they follow you and you do not follow them', () => {
    expect(followButtonLabel(false, true)).toEqual({ label: 'Follow back', followsYou: true });
    expect(followButtonLabel(false, false)).toEqual({ label: 'Follow', followsYou: false });
    expect(followButtonLabel(true, true)).toEqual({ label: 'Following', followsYou: false });
  });
});
