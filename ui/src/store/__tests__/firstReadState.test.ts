/**
 * The notifications and messages lists tell three things apart (round 4 N2 / M1): still loading
 * (nothing read yet), a read that failed (say so, with Try again) and a read that worked and found
 * nothing. The stores keep `loaded` and `error` for that; what they fetch is unchanged.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/api', () => ({
  getNotifications: jest.fn(),
  getUnreadCount: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  getProfile: jest.fn(),
  getInbox: jest.fn(),
  getRequests: jest.fn(),
  acceptRequest: jest.fn(),
  deleteConversation: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { channel: jest.fn(), removeChannel: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

import * as api from '@/api';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useMessagesStore } from '@/store/messagesStore';

const mocked = api as unknown as Record<string, jest.Mock>;
const fail = { data: null, error: new Error('offline') };

beforeEach(() => {
  jest.clearAllMocks();
  useNotificationsStore.getState().reset();
  useMessagesStore.getState().reset();
});

describe('notifications: first read', () => {
  it('starts neither loaded nor failed', () => {
    expect(useNotificationsStore.getState()).toMatchObject({ loaded: false, error: false });
  });

  it('a failed read sets error and keeps what was there', async () => {
    mocked.getNotifications.mockResolvedValue(fail);
    mocked.getUnreadCount.mockResolvedValue(fail);
    await useNotificationsStore.getState().sync('me');
    expect(useNotificationsStore.getState()).toMatchObject({
      loaded: false,
      error: true,
      items: [],
    });
  });

  it('a read that works marks it loaded and clears an earlier error', async () => {
    mocked.getNotifications.mockResolvedValueOnce(fail).mockResolvedValueOnce({
      data: [],
      error: null,
    });
    mocked.getUnreadCount.mockResolvedValue({ data: 0, error: null });
    await useNotificationsStore.getState().sync('me');
    await useNotificationsStore.getState().sync('me');
    expect(useNotificationsStore.getState()).toMatchObject({ loaded: true, error: false });
  });

  it('reset forgets both', async () => {
    mocked.getNotifications.mockResolvedValue(fail);
    mocked.getUnreadCount.mockResolvedValue(fail);
    await useNotificationsStore.getState().sync('me');
    useNotificationsStore.getState().reset();
    expect(useNotificationsStore.getState()).toMatchObject({ loaded: false, error: false });
  });
});

describe('messages: first read', () => {
  it('starts neither loaded nor failed', () => {
    expect(useMessagesStore.getState()).toMatchObject({ loaded: false, error: false });
  });

  it('a failed inbox or requests read sets error', async () => {
    mocked.getInbox.mockResolvedValue(fail);
    mocked.getRequests.mockResolvedValue({ data: [], error: null });
    await useMessagesStore.getState().sync();
    expect(useMessagesStore.getState()).toMatchObject({ loaded: false, error: true });
  });

  it('a read that works marks it loaded and clears an earlier error', async () => {
    mocked.getInbox.mockResolvedValueOnce(fail).mockResolvedValueOnce({ data: [], error: null });
    mocked.getRequests.mockResolvedValue({ data: [], error: null });
    await useMessagesStore.getState().sync();
    await useMessagesStore.getState().sync();
    expect(useMessagesStore.getState()).toMatchObject({ loaded: true, error: false });
  });

  it('reset forgets both', async () => {
    mocked.getInbox.mockResolvedValue(fail);
    mocked.getRequests.mockResolvedValue(fail);
    await useMessagesStore.getState().sync();
    useMessagesStore.getState().reset();
    expect(useMessagesStore.getState()).toMatchObject({ loaded: false, error: false });
  });
});
