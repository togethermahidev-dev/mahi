jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
const getFollowData = jest.fn();
const setFollowing = jest.fn();

jest.mock('@/api', () => ({
  getFollowData: (...a: unknown[]) => getFollowData(...a),
  setFollowing: (...a: unknown[]) => setFollowing(...a),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { channel: jest.fn(), removeChannel: jest.fn() },
}));

import { useFollowStore } from '@/store/followStore';

describe('followStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFollowStore.getState().reset();
  });

  it('updates immediately, then reconciles counts from the committed server row', async () => {
    useFollowStore.setState({
      followingByMe: { target: false },
      followsMe: { target: false },
      counts: {
        me: { follower_count: 2, following_count: 5 },
        target: { follower_count: 8, following_count: 4 },
      },
    });
    let finish!: (value: unknown) => void;
    setFollowing.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const pending = useFollowStore.getState().toggleFollow('me', 'target');
    expect(useFollowStore.getState().followingByMe.target).toBe(true);
    expect(useFollowStore.getState().counts.target.follower_count).toBe(9);
    expect(useFollowStore.getState().counts.me.following_count).toBe(6);

    finish({
      data: {
        is_following: true,
        follows_you: true,
        follower_count: 10,
        following_count: 4,
        current_following_count: 7,
      },
      error: null,
    });
    await pending;

    expect(useFollowStore.getState().followsMe.target).toBe(true);
    expect(useFollowStore.getState().counts.target.follower_count).toBe(10);
    expect(useFollowStore.getState().counts.me.following_count).toBe(7);
  });

  it('rolls the optimistic state back when the server refuses the mutation', async () => {
    useFollowStore.setState({
      followingByMe: { target: true },
      followsMe: { target: false },
      counts: { target: { follower_count: 8, following_count: 4 } },
    });
    setFollowing.mockResolvedValue({ data: null, error: new Error('no') });

    await useFollowStore.getState().toggleFollow('me', 'target');

    expect(useFollowStore.getState().followingByMe.target).toBe(true);
    expect(useFollowStore.getState().counts.target.follower_count).toBe(8);
  });

  describe('live follow changes', () => {
    const { supabase } = jest.requireMock('@/lib/supabase') as {
      supabase: { channel: jest.Mock; removeChannel: jest.Mock };
    };
    type Spec = { event: string; table: string; filter?: string };
    const made: { name: string; specs: Spec[] }[] = [];
    beforeEach(() => {
      made.length = 0;
      supabase.channel.mockImplementation((name: string) => {
        const entry = { name, specs: [] as Spec[] };
        made.push(entry);
        const ch = {
          on: (_t: string, spec: Spec) => {
            entry.specs.push(spec);
            return ch;
          },
          subscribe: () => ch,
        };
        return ch;
      });
    });

    // Supabase can't filter DELETE events, so an unfollow only arrives on an unfiltered listener.
    it('listens for unfollows without a filter', () => {
      useFollowStore.getState().subscribeToFollows('u1', 'me');
      expect(made[0].specs).toContainEqual({ event: 'DELETE', schema: 'public', table: 'follows' });
    });

    it('an old screen closing after sign-out leaves the new listener open', () => {
      const stale = useFollowStore.getState().subscribeToFollows('u1', 'me');
      useFollowStore.getState().reset();
      useFollowStore.getState().subscribeToFollows('u1', 'me');
      supabase.removeChannel.mockClear();
      stale();
      expect(supabase.removeChannel).not.toHaveBeenCalled();
    });
  });
});
