/**
 * Live likes and comments on an open post. A live comment arrives as the bare table row, with no
 * commenter attached; the comment sheet reads the commenter's name, so the row needs it first.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/api', () => ({
  toggleLike: jest.fn(),
  addComment: jest.fn(),
  getComments: jest.fn(),
  getFeed: jest.fn(),
  getUserPosts: jest.fn(),
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

type Spec = { event: string; table: string; filter?: string };
type Handler = (payload: { new: Record<string, unknown> }) => unknown;
const listeners: { spec: Spec; handler: Handler }[] = [];
const commenter = { id: 'sam', username: 'sam', display_name: 'Sam', avatar_url: null };

jest.mock('@/lib/supabase', () => {
  const ch = {
    on: (_t: string, spec: Spec, handler: Handler) => {
      listeners.push({ spec, handler });
      return ch;
    },
    subscribe: () => ch,
  };
  const single = () => Promise.resolve({ data: commenter, error: null });
  return {
    supabase: {
      channel: () => ch,
      removeChannel: jest.fn(),
      from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
    },
  };
});

import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';

const commentRow = (id: string, user_id: string) => ({
  id,
  post_id: 'p',
  user_id,
  content: 'nice',
  created_at: '2026-10-07T12:00:00Z',
});
const onComment = () =>
  listeners.find((l) => l.spec.table === 'post_comments' && l.spec.event === 'INSERT')!.handler;

beforeEach(() => {
  listeners.length = 0;
  useSocialStore.getState().reset();
  useAuthStore.setState({ user: { id: 'me' } } as never);
  useSocialStore.setState({ comments: { p: [] } });
  useSocialStore.getState().subscribeToPost('p');
});

afterEach(() => useSocialStore.getState().unsubscribeFromPost('p'));

describe('live comments', () => {
  it('adds someone else’s comment with their name attached', async () => {
    await onComment()({ new: commentRow('c1', 'sam') });
    expect(useSocialStore.getState().comments.p).toEqual([
      { ...commentRow('c1', 'sam'), profiles: commenter },
    ]);
  });

  it('leaves your own comment to the comment you just sent', async () => {
    await onComment()({ new: commentRow('c2', 'me') });
    expect(useSocialStore.getState().comments.p).toEqual([]);
  });
});

describe('live likes', () => {
  // Supabase can't filter DELETE events, so an unlike only arrives on an unfiltered listener.
  it('listens for unlikes without a filter', () => {
    expect(listeners.map((l) => l.spec)).toContainEqual({
      event: 'DELETE',
      schema: 'public',
      table: 'post_likes',
    });
  });
});
