/**
 * A `streak_lost` notice means the server has just put your Mahi points back to 0. The number on the
 * camera and your profile comes from the profile in userStore, so that must be re-read when the
 * notice arrives; nothing else about a notification touches the profile.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/api', () => ({
  getNotifications: jest.fn(),
  getUnreadCount: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  getProfile: jest.fn(),
}));

type InsertHandler = (payload: { new: unknown }) => Promise<void>;
let onInsert: InsertHandler | null = null;
const fakeChannel = {
  on: (_event: string, _config: unknown, cb: InsertHandler) => {
    onInsert = cb;
    return fakeChannel;
  },
  subscribe: () => fakeChannel,
};
const actor = { id: 'tagger', username: 'sam', display_name: null, avatar_url: null };
jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => fakeChannel),
    removeChannel: jest.fn(),
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: actor }) }) }),
    }),
  },
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

import { useNotificationsStore } from '@/store/notificationsStore';
import { useUserStore } from '@/store/userStore';
import { useBlockStore } from '@/store/blockStore';

const refresh = jest.fn(async () => {});
const row = (type: string) => ({
  new: {
    id: `n-${type}`,
    user_id: 'me',
    actor_id: 'tagger',
    type,
    post_id: null,
    challenge_id: 'c1',
    comment_id: null,
    is_read: false,
    created_at: '2026-10-01T12:00:00.000Z',
  },
});

beforeEach(() => {
  onInsert = null;
  refresh.mockClear();
  useNotificationsStore.getState().reset();
  useBlockStore.getState().reset();
  useUserStore.setState({ refresh });
  useNotificationsStore.getState().subscribe('me');
});

describe('a streak_lost notice', () => {
  it('re-reads my profile so the points show 0 straight away', async () => {
    await onInsert!(row('streak_lost'));
    expect(refresh).toHaveBeenCalledWith('me');
  });

  it('is the only notice that touches the profile', async () => {
    await onInsert!(row('like'));
    await onInsert!(row('tag_missed'));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('a live notice from someone blocked', () => {
  it('does not bump the badge or join the list', async () => {
    useBlockStore.setState({ blockedSet: new Set(['tagger']) });
    await onInsert!(row('like'));
    expect(useNotificationsStore.getState().unreadCount).toBe(0);
    expect(useNotificationsStore.getState().items).toHaveLength(0);
  });

  it('from anyone else, counts as before', async () => {
    await onInsert!(row('like'));
    expect(useNotificationsStore.getState().unreadCount).toBe(1);
  });
});
