/**
 * Core action events for the founder's numbers: each is sent once, from the store, only after
 * the server confirms, and carries the id of what the server made — so a duplicate can be seen
 * and a refused action never shows up as one.
 */
const track = jest.fn();
jest.mock('@/lib/analytics', () => ({ track: (...a: unknown[]) => track(...a) }));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));

jest.mock('@/api', () => ({
  getFollowData: jest.fn(),
  setFollowing: jest.fn(),
  removeFollower: jest.fn(),
  respondFollowRequest: jest.fn(),
  getFollowRequests: jest.fn(),
  setAccountControls: jest.fn(),
  toggleLike: jest.fn(),
  addComment: jest.fn(),
  getComments: jest.fn(),
  getCommentLikes: jest.fn(),
  toggleCommentLike: jest.fn(),
  getCommentLikers: jest.fn(),
  getFeed: jest.fn(),
  getUserPosts: jest.fn(),
  getMessages: jest.fn(),
  sendMessage: jest.fn(),
  editMessage: jest.fn(),
  unsendMessage: jest.fn(),
  startConversation: jest.fn(),
  getInbox: jest.fn(async () => ({ data: [], error: null })),
  getRequests: jest.fn(async () => ({ data: [], error: null })),
  markConversationRead: jest.fn(async () => ({ error: null })),
  MESSAGE_PAGE: 30,
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { channel: jest.fn(), removeChannel: jest.fn() },
}));
let nextId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `cid-${++nextId}` }));
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

import * as api from '@/api';
import { useFollowStore } from '@/store/followStore';
import { useSocialStore } from '@/store/socialStore';
import { useConversationStore } from '@/store/conversationStore';
import { useToastStore } from '@/store/toastStore';
import { useFollowRequestStore } from '@/store/followRequestStore';
import { useUserStore } from '@/store/userStore';

const mocked = api as jest.Mocked<typeof api>;
const followRow = (
  is_following: boolean,
  follows_you = false,
  status: 'following' | 'requested' | 'none' = is_following ? 'following' : 'none'
) => ({
  data: {
    is_following,
    follows_you,
    follower_count: 1,
    following_count: 1,
    current_following_count: 1,
    status,
    is_private: status === 'requested',
  },
  error: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  useFollowStore.getState().reset();
  useSocialStore.getState().reset();
  useConversationStore.getState().reset();
  useToastStore.getState().reset();
  useFollowRequestStore.getState().reset();
  useUserStore.getState().reset();
});

// Private accounts (20261008170000_private_accounts).
describe('follow requests and controls', () => {
  it('a follow that became a request sends follow_requested, not user_followed', async () => {
    mocked.setFollowing.mockResolvedValue(followRow(false, false, 'requested'));
    await useFollowStore.getState().toggleFollow('me', 'them');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('follow_requested', { target_id: 'them' });
  });

  it('taking a request back sends follow_request_cancelled', async () => {
    useFollowStore.setState({ requestedByMe: { them: true } });
    mocked.setFollowing.mockResolvedValue(followRow(false));
    await useFollowStore.getState().toggleFollow('me', 'them');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('follow_request_cancelled', { target_id: 'them' });
  });

  it('answering a follow request sends follow_request_answered once the server has it', async () => {
    useFollowRequestStore.setState({
      requests: [
        {
          requester_id: 'r1',
          username: 'sam',
          display_name: null,
          avatar_url: null,
          requested_at: 'now',
        },
      ],
    });
    mocked.respondFollowRequest.mockResolvedValue({
      data: { status: 'accepted', follow_back: null },
      error: null,
    });
    await useFollowRequestStore.getState().respond('me', 'r1', true);
    expect(track).toHaveBeenCalledWith('follow_request_answered', { accepted: true });
  });

  it('removing a follower sends follower_removed', async () => {
    mocked.removeFollower.mockResolvedValue({
      data: { removed: true, tags_ended: 0 },
      error: null,
    });
    await useFollowStore.getState().removeFollower('me', 'f1');
    expect(track).toHaveBeenCalledWith('follower_removed', { tags_ended: 0 });
  });

  it('changing a control sends what the server saved', async () => {
    useUserStore.setState({ profile: { id: 'me', is_private: false } as never });
    mocked.setAccountControls.mockResolvedValue({
      data: {
        is_private: true,
        posts_visibility: 'followers',
        tag_permission: 'approve',
        accepted_requests: 0,
      },
      error: null,
    });
    await useUserStore.getState().saveControls({ is_private: true });
    expect(track).toHaveBeenCalledWith('account_controls_changed', {
      is_private: true,
      posts_visibility: 'followers',
      tag_permission: 'approve',
    });
  });

  it('sends nothing when the server refuses', async () => {
    mocked.setFollowing.mockResolvedValue({ data: null, error: new Error('no') });
    await useFollowStore.getState().toggleFollow('me', 'them');
    mocked.removeFollower.mockResolvedValue({ data: null, error: new Error('no') });
    await useFollowStore.getState().removeFollower('me', 'f1');
    mocked.respondFollowRequest.mockResolvedValue({ data: null, error: new Error('no') });
    await useFollowRequestStore.getState().respond('me', 'r1', true);
    useUserStore.setState({ profile: { id: 'me', is_private: false } as never });
    mocked.setAccountControls.mockResolvedValue({ data: null, error: new Error('no') });
    await useUserStore.getState().saveControls({ is_private: true });
    expect(track).not.toHaveBeenCalled();
  });
});

describe('follows', () => {
  it('sends user_followed once the server has the follow, saying whether it made friends', async () => {
    mocked.setFollowing.mockResolvedValue(followRow(true, true));
    await useFollowStore.getState().toggleFollow('me', 'them');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('user_followed', { target_id: 'them', friends: true });
  });

  it('sends user_unfollowed once the server has dropped it', async () => {
    useFollowStore.setState({ followingByMe: { them: true } });
    mocked.setFollowing.mockResolvedValue(followRow(false));
    await useFollowStore.getState().toggleFollow('me', 'them');
    expect(track).toHaveBeenCalledWith('user_unfollowed', { target_id: 'them' });
  });

  it('sends nothing when the server refuses', async () => {
    mocked.setFollowing.mockResolvedValue({ data: null, error: new Error('no') });
    await useFollowStore.getState().toggleFollow('me', 'them');
    expect(track).not.toHaveBeenCalled();
  });

  it('sends nothing when the server says nothing changed', async () => {
    mocked.setFollowing.mockResolvedValue(followRow(false));
    await useFollowStore.getState().toggleFollow('me', 'them');
    expect(track).not.toHaveBeenCalled();
  });
});

describe('likes and comments', () => {
  it('sends post_liked when the server says the post is now liked', async () => {
    mocked.toggleLike.mockResolvedValue({ data: { liked: true, like_count: 3 }, error: null });
    await useSocialStore.getState().toggleLike('p1', 'me');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('post_liked', { post_id: 'p1' });
  });

  it('sends nothing for taking a like back, or for a like that failed', async () => {
    mocked.toggleLike.mockResolvedValue({ data: { liked: false, like_count: 2 }, error: null });
    await useSocialStore.getState().toggleLike('p1', 'me');
    mocked.toggleLike.mockResolvedValue({ data: null, error: new Error('offline') });
    await useSocialStore.getState().toggleLike('p2', 'me');
    expect(track).not.toHaveBeenCalled();
  });

  it('sends comment_added with the saved comment id', async () => {
    mocked.addComment.mockResolvedValue({
      data: { id: 'c1', post_id: 'p1', user_id: 'me', content: 'hi', created_at: 'now' } as never,
      error: null,
    });
    await useSocialStore.getState().addComment('p1', 'me', 'hi', { username: 'me' } as never);
    expect(track).toHaveBeenCalledWith('comment_added', { comment_id: 'c1', post_id: 'p1' });
  });

  it('sends nothing for a comment that did not save', async () => {
    mocked.addComment.mockResolvedValue({ data: null, error: new Error('offline') });
    await useSocialStore.getState().addComment('p1', 'me', 'hi', { username: 'me' } as never);
    expect(track).not.toHaveBeenCalled();
  });
});

describe('messages', () => {
  const row = { id: 'm1', conversation_id: 'c1', sender_id: 'me', content: 'hi', client_id: 'x' };

  it('sends message_sent with the saved message id', async () => {
    mocked.sendMessage.mockResolvedValue({
      data: { ...row, created_at: 'now' } as never,
      error: null,
    });
    await useConversationStore.getState().send('c1', 'me', 'hi');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('message_sent', {
      message_id: 'm1',
      conversation_id: 'c1',
      first: false,
    });
  });

  it('marks the first message to someone as first', async () => {
    mocked.startConversation.mockResolvedValue({
      data: { conversationId: 'c1', status: 'requested', message: { ...row, created_at: 'now' } },
      error: null,
    } as never);
    await useConversationStore.getState().start('them', 'me', 'hi');
    expect(track).toHaveBeenCalledWith('message_sent', {
      message_id: 'm1',
      conversation_id: 'c1',
      first: true,
    });
  });

  it('sends nothing for a message that did not go', async () => {
    mocked.sendMessage.mockResolvedValue({ data: null, error: new Error('offline') });
    await useConversationStore.getState().send('c1', 'me', 'hi');
    mocked.startConversation.mockResolvedValue({ data: null, error: new Error('blocked') });
    await useConversationStore.getState().start('them', 'me', 'hi');
    expect(track).not.toHaveBeenCalled();
  });
});
