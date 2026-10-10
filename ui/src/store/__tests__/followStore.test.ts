jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
const getFollowData = jest.fn();
const setFollowing = jest.fn();
const removeFollower = jest.fn();

jest.mock('@/api', () => ({
  getFollowData: (...a: unknown[]) => getFollowData(...a),
  setFollowing: (...a: unknown[]) => setFollowing(...a),
  removeFollower: (...a: unknown[]) => removeFollower(...a),
}));
// Stores send analytics events; PostHog's SDK is not loaded in these node tests.
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
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

  // Counts on a profile (switch `profile-bio-and-counts`): the screen waits for this read before
  // it shows a number, and the server keeps the counts back across a block.
  describe('loading the counts', () => {
    const answer = {
      is_following: false,
      follows_you: false,
      requested: false,
      is_private: false,
      follower_count: 12,
      following_count: 8,
    };

    it('says the read worked, with the counts in place', async () => {
      getFollowData.mockResolvedValue({ data: answer, error: null });
      await expect(useFollowStore.getState().loadFollowData('me', 'target')).resolves.toBe(true);
      expect(useFollowStore.getState().counts.target).toEqual({
        follower_count: 12,
        following_count: 8,
      });
    });

    it('says the read failed, and keeps nothing new', async () => {
      getFollowData.mockResolvedValue({ data: null, error: new Error('offline') });
      await expect(useFollowStore.getState().loadFollowData('me', 'target')).resolves.toBe(false);
      expect(useFollowStore.getState().counts.target).toBeUndefined();
    });

    it('counts the server keeps back (a block) are dropped, never shown as 0', async () => {
      useFollowStore.setState({ counts: { target: { follower_count: 12, following_count: 8 } } });
      getFollowData.mockResolvedValue({
        data: { ...answer, follower_count: null, following_count: null },
        error: null,
      });
      await expect(useFollowStore.getState().loadFollowData('me', 'target')).resolves.toBe(true);
      expect(useFollowStore.getState().counts.target).toBeUndefined();
    });

    it('an unfollow answered without counts drops them too', async () => {
      useFollowStore.setState({
        followingByMe: { target: true },
        counts: { target: { follower_count: 12, following_count: 8 } },
      });
      setFollowing.mockResolvedValue({
        data: {
          ...answer,
          status: 'none',
          follower_count: null,
          following_count: null,
          current_following_count: 0,
        },
        error: null,
      });
      await useFollowStore.getState().toggleFollow('me', 'target');
      expect(useFollowStore.getState().counts.target).toBeUndefined();
    });
  });

  // Private accounts (20261008170000_private_accounts): a follow can come back as a request.
  describe('follow requests', () => {
    const row = (status: string, over: Record<string, unknown> = {}) => ({
      data: {
        is_following: status === 'following',
        follows_you: false,
        follower_count: 8,
        following_count: 4,
        current_following_count: 5,
        status,
        is_private: true,
        ...over,
      },
      error: null,
    });

    it('a follow the server makes a request shows Requested, not Following', async () => {
      useFollowStore.setState({
        counts: {
          me: { follower_count: 2, following_count: 5 },
          target: { follower_count: 8, following_count: 4 },
        },
      });
      setFollowing.mockResolvedValue(row('requested'));

      const { status } = await useFollowStore.getState().toggleFollow('me', 'target');

      const s = useFollowStore.getState();
      expect(status).toBe('requested');
      expect(s.followingByMe.target).toBe(false);
      expect(s.requestedByMe.target).toBe(true);
      expect(s.privateById.target).toBe(true);
      expect(s.counts.target.follower_count).toBe(8);
      expect(s.counts.me.following_count).toBe(5);
    });

    it('a known private account shows Requested at once and counts nothing', () => {
      useFollowStore.setState({
        privateById: { target: true },
        counts: { target: { follower_count: 8, following_count: 4 } },
      });
      setFollowing.mockReturnValue(new Promise(() => {}));

      void useFollowStore.getState().toggleFollow('me', 'target');

      const s = useFollowStore.getState();
      expect(s.requestedByMe.target).toBe(true);
      expect(s.followingByMe.target).toBe(false);
      expect(s.counts.target.follower_count).toBe(8);
    });

    it('a tap on Requested takes the request back', async () => {
      useFollowStore.setState({ requestedByMe: { target: true }, privateById: { target: true } });
      let finish!: (value: unknown) => void;
      setFollowing.mockReturnValue(new Promise((resolve) => (finish = resolve)));

      const pending = useFollowStore.getState().toggleFollow('me', 'target');
      expect(setFollowing).toHaveBeenCalledWith('target', false);
      expect(useFollowStore.getState().requestedByMe.target).toBe(false);

      finish(row('none'));
      await pending;
      expect(useFollowStore.getState().requestedByMe.target).toBe(false);
      expect(useFollowStore.getState().followingByMe.target).toBe(false);
    });

    it('a refused take-back goes back to Requested', async () => {
      useFollowStore.setState({ requestedByMe: { target: true }, privateById: { target: true } });
      setFollowing.mockResolvedValue({ data: null, error: new Error('offline') });

      const { error } = await useFollowStore.getState().toggleFollow('me', 'target');

      expect(error?.message).toBe('offline');
      expect(useFollowStore.getState().requestedByMe.target).toBe(true);
    });

    it('a request they approved reads as Following on the next load', async () => {
      useFollowStore.setState({ requestedByMe: { target: true } });
      getFollowData.mockResolvedValue({
        data: {
          is_following: true,
          follows_you: false,
          follower_count: 9,
          following_count: 4,
          requested: false,
          is_private: true,
        },
        error: null,
      });

      await useFollowStore.getState().loadFollowData('me', 'target');

      const s = useFollowStore.getState();
      expect(s.followingByMe.target).toBe(true);
      expect(s.requestedByMe.target).toBe(false);
      expect(s.privateById.target).toBe(true);
    });

    // A suggestion whose privacy isn't known yet: no count moves until the server answers.
    it('holdCounts leaves counts alone until the server answers', async () => {
      useFollowStore.setState({
        counts: {
          me: { follower_count: 2, following_count: 5 },
          target: { follower_count: 8, following_count: 4 },
        },
      });
      let finish!: (value: unknown) => void;
      setFollowing.mockReturnValue(new Promise((resolve) => (finish = resolve)));

      const pending = useFollowStore.getState().toggleFollow('me', 'target', { holdCounts: true });
      expect(useFollowStore.getState().counts.target.follower_count).toBe(8);
      expect(useFollowStore.getState().counts.me.following_count).toBe(5);

      finish(row('requested'));
      await pending;
      expect(useFollowStore.getState().requestedByMe.target).toBe(true);
      expect(useFollowStore.getState().counts.me.following_count).toBe(5);
    });

    it('setFollow never unfollows when asked to follow', async () => {
      useFollowStore.setState({ followingByMe: { target: true } });
      setFollowing.mockResolvedValue(row('following', { is_private: false }));
      await useFollowStore.getState().setFollow('me', 'target', true);
      expect(setFollowing).toHaveBeenCalledWith('target', true);
    });
  });

  describe('removeFollower', () => {
    it('drops them at once and keeps the server’s answer', async () => {
      useFollowStore.setState({
        followsMe: { f1: true },
        counts: { me: { follower_count: 3, following_count: 1 } },
      });
      removeFollower.mockResolvedValue({ data: { removed: true, tags_ended: 1 }, error: null });

      const { error, tagsEnded } = await useFollowStore.getState().removeFollower('me', 'f1');

      expect(error).toBeNull();
      expect(tagsEnded).toBe(1);
      expect(removeFollower).toHaveBeenCalledWith('f1');
      expect(useFollowStore.getState().followsMe.f1).toBe(false);
      expect(useFollowStore.getState().counts.me.follower_count).toBe(2);
    });

    it('puts them back when the server refuses', async () => {
      useFollowStore.setState({
        followsMe: { f1: true },
        counts: { me: { follower_count: 3, following_count: 1 } },
      });
      removeFollower.mockResolvedValue({ data: null, error: new Error('no') });

      const { error } = await useFollowStore.getState().removeFollower('me', 'f1');

      expect(error?.message).toBe('no');
      expect(useFollowStore.getState().followsMe.f1).toBe(true);
      expect(useFollowStore.getState().counts.me.follower_count).toBe(3);
    });
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
