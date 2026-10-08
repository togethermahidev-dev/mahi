/**
 * Follow requests to a private account (20261008170000_private_accounts): read fresh, live while
 * open, answered at once and put back if the server refuses. Never kept on the phone.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
const getFollowRequests = jest.fn();
const respondFollowRequest = jest.fn();
jest.mock('@/api', () => ({
  getFollowRequests: (...a: unknown[]) => getFollowRequests(...a),
  respondFollowRequest: (...a: unknown[]) => respondFollowRequest(...a),
  getFollowData: jest.fn(),
  setFollowing: jest.fn(),
  removeFollower: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { channel: jest.fn(), removeChannel: jest.fn() },
}));

import { useFollowRequestStore } from '@/store/followRequestStore';
import { useFollowStore } from '@/store/followStore';

const req = (id: string) => ({
  requester_id: id,
  username: id,
  display_name: null,
  avatar_url: null,
  requested_at: '2026-10-08T10:00:00Z',
});

beforeEach(() => {
  // Close the last test's channels first, so their removal isn't counted in this one.
  useFollowRequestStore.getState().reset();
  useFollowStore.getState().reset();
  jest.clearAllMocks();
});

describe('load', () => {
  it('starts unread (a loading state), then shows the server’s list', async () => {
    expect(useFollowRequestStore.getState().requests).toBeNull();
    getFollowRequests.mockResolvedValue({ data: [req('a'), req('b')], error: null });
    await useFollowRequestStore.getState().load();
    expect(useFollowRequestStore.getState().requests?.map((r) => r.requester_id)).toEqual([
      'a',
      'b',
    ]);
    expect(useFollowRequestStore.getState().failed).toBe(false);
  });

  it('a failed first read says so instead of an empty list', async () => {
    getFollowRequests.mockResolvedValue({ data: null, error: new Error('offline') });
    await useFollowRequestStore.getState().load();
    expect(useFollowRequestStore.getState().requests).toBeNull();
    expect(useFollowRequestStore.getState().failed).toBe(true);
  });

  it('clear forgets the list, so the next open shows a loading state, not old rows', async () => {
    getFollowRequests.mockResolvedValue({ data: [req('a')], error: null });
    await useFollowRequestStore.getState().load();
    useFollowRequestStore.getState().clear();
    expect(useFollowRequestStore.getState().requests).toBeNull();
  });
});

describe('respond', () => {
  it('Confirm removes the row at once, then keeps the server’s answer', async () => {
    useFollowRequestStore.setState({ requests: [req('a'), req('b')] });
    useFollowStore.setState({ counts: { me: { follower_count: 1, following_count: 0 } } });
    let finish!: (v: unknown) => void;
    respondFollowRequest.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const pending = useFollowRequestStore.getState().respond('me', 'a', true);
    expect(useFollowRequestStore.getState().requests?.map((r) => r.requester_id)).toEqual(['b']);
    expect(respondFollowRequest).toHaveBeenCalledWith('a', true, false);

    finish({ data: { status: 'accepted', follow_back: null }, error: null });
    const { error } = await pending;
    expect(error).toBeNull();
    // They follow you now.
    expect(useFollowStore.getState().followsMe.a).toBe(true);
    expect(useFollowStore.getState().counts.me.follower_count).toBe(2);
  });

  it('Delete removes the row and adds no follower', async () => {
    useFollowRequestStore.setState({ requests: [req('a')] });
    respondFollowRequest.mockResolvedValue({
      data: { status: 'declined', follow_back: null },
      error: null,
    });
    await useFollowRequestStore.getState().respond('me', 'a', false);
    expect(useFollowRequestStore.getState().requests).toEqual([]);
    expect(useFollowStore.getState().followsMe.a).toBeUndefined();
  });

  it('a follow back the server answered shows on their follow button', async () => {
    useFollowRequestStore.setState({ requests: [req('a')] });
    respondFollowRequest.mockResolvedValue({
      data: { status: 'accepted', follow_back: 'requested' },
      error: null,
    });
    await useFollowRequestStore.getState().respond('me', 'a', true, true);
    expect(respondFollowRequest).toHaveBeenCalledWith('a', true, true);
    expect(useFollowStore.getState().requestedByMe.a).toBe(true);
    expect(useFollowStore.getState().followingByMe.a).toBe(false);
  });

  it('a request already gone (taken back) just leaves the list', async () => {
    useFollowRequestStore.setState({ requests: [req('a')] });
    respondFollowRequest.mockResolvedValue({
      data: { status: 'gone', follow_back: null },
      error: null,
    });
    const { error } = await useFollowRequestStore.getState().respond('me', 'a', true);
    expect(error).toBeNull();
    expect(useFollowRequestStore.getState().requests).toEqual([]);
    expect(useFollowStore.getState().followsMe.a).toBeUndefined();
  });

  it('a refusal puts the row back where it was', async () => {
    useFollowRequestStore.setState({ requests: [req('a'), req('b'), req('c')] });
    respondFollowRequest.mockResolvedValue({ data: null, error: new Error('offline') });
    const { error } = await useFollowRequestStore.getState().respond('me', 'b', true);
    expect(error?.message).toBe('offline');
    expect(useFollowRequestStore.getState().requests?.map((r) => r.requester_id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('live while open', () => {
  const { supabase } = jest.requireMock('@/lib/supabase') as {
    supabase: { channel: jest.Mock; removeChannel: jest.Mock };
  };
  type Spec = { event: string; table: string; filter?: string };
  const made: { name: string; specs: Spec[]; handlers: (() => void)[] }[] = [];
  beforeEach(() => {
    made.length = 0;
    supabase.channel.mockImplementation((name: string) => {
      const entry = { name, specs: [] as Spec[], handlers: [] as (() => void)[] };
      made.push(entry);
      const ch = {
        on: (_t: string, spec: Spec, handler: () => void) => {
          entry.specs.push(spec);
          entry.handlers.push(handler);
          return ch;
        },
        subscribe: () => ch,
      };
      return ch;
    });
  });

  it('listens for new requests to you, and for any request ending (DELETE has no filter)', () => {
    useFollowRequestStore.getState().subscribe('me');
    expect(made[0].specs).toContainEqual({
      event: 'INSERT',
      schema: 'public',
      table: 'follow_requests',
      filter: 'target_id=eq.me',
    });
    expect(made[0].specs).toContainEqual({
      event: 'DELETE',
      schema: 'public',
      table: 'follow_requests',
    });
  });

  it('a change reads the list again', () => {
    getFollowRequests.mockResolvedValue({ data: [], error: null });
    useFollowRequestStore.getState().subscribe('me');
    made[0].handlers[0]();
    expect(getFollowRequests).toHaveBeenCalledTimes(1);
  });

  // Every follow request deleted anywhere reaches the unfiltered DELETE listener, so a burst of
  // them re-reads once now and once when the burst has passed, not once each.
  describe('a burst of deletes', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('re-reads at most once every 1.5 seconds', () => {
      getFollowRequests.mockResolvedValue({ data: [], error: null });
      useFollowRequestStore.getState().subscribe('me');
      const onDelete = made[0].handlers[1];

      for (let i = 0; i < 5; i++) onDelete();
      expect(getFollowRequests).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1499);
      expect(getFollowRequests).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1);
      expect(getFollowRequests).toHaveBeenCalledTimes(2);

      // Quiet since: nothing more.
      jest.advanceTimersByTime(5000);
      expect(getFollowRequests).toHaveBeenCalledTimes(2);
    });

    it('a single delete re-reads once', () => {
      getFollowRequests.mockResolvedValue({ data: [], error: null });
      useFollowRequestStore.getState().subscribe('me');
      made[0].handlers[1]();
      jest.advanceTimersByTime(5000);
      expect(getFollowRequests).toHaveBeenCalledTimes(1);
    });

    it('sign-out drops a re-read that was waiting', () => {
      getFollowRequests.mockResolvedValue({ data: [], error: null });
      useFollowRequestStore.getState().subscribe('me');
      made[0].handlers[1]();
      made[0].handlers[1]();
      useFollowRequestStore.getState().reset();
      jest.advanceTimersByTime(5000);
      expect(getFollowRequests).toHaveBeenCalledTimes(1);
    });
  });

  it('two screens share one channel; it closes when the last one leaves', () => {
    const a = useFollowRequestStore.getState().subscribe('me');
    const b = useFollowRequestStore.getState().subscribe('me');
    expect(made).toHaveLength(1);
    a();
    expect(supabase.removeChannel).not.toHaveBeenCalled();
    b();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('reset closes every channel and forgets the list', () => {
    useFollowRequestStore.setState({ requests: [req('a')] });
    const stale = useFollowRequestStore.getState().subscribe('me');
    useFollowRequestStore.getState().reset();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(useFollowRequestStore.getState().requests).toBeNull();
    supabase.removeChannel.mockClear();
    useFollowRequestStore.getState().subscribe('me');
    stale();
    expect(supabase.removeChannel).not.toHaveBeenCalled();
  });
});
