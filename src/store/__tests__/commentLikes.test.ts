/**
 * Comment likes (flag comment-likes): a heart and a count on each comment. A tap moves the heart
 * and the count at once, then takes the server's answer; a failed tap goes back. The counts are
 * read fresh each time a post's comments open, and shown only once they've arrived. Who liked a
 * comment is never kept: it's read fresh each time the list opens.
 */
jest.mock('@/api', () => ({
  toggleLike: jest.fn(),
  addComment: jest.fn(),
  getComments: jest.fn(),
  getCommentLikes: jest.fn(),
  toggleCommentLike: jest.fn(),
  getCommentLikers: jest.fn(),
  getFeed: jest.fn(),
  getUserPosts: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { removeChannel: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

import * as api from '@/api';
import { useSocialStore } from '@/store/socialStore';
import { useToastStore } from '@/store/toastStore';

const mocked = api as jest.Mocked<typeof api>;
const social = () => useSocialStore.getState();
const likesOf = (commentId: string) => social().commentLike(commentId);

beforeEach(() => {
  jest.clearAllMocks();
  social().reset();
  useToastStore.getState().reset();
});

describe('loading a post’s comment likes', () => {
  it('shows nothing until this opening’s numbers arrive, then shows them', async () => {
    let answer!: (v: Awaited<ReturnType<typeof api.getCommentLikes>>) => void;
    mocked.getCommentLikes.mockReturnValue(new Promise((r) => (answer = r)));
    const done = social().loadCommentLikes('p');
    expect(social().commentLikesReady.p).toBe(false);
    answer({
      data: [
        { comment_id: 'c1', like_count: 3, liked_by_me: true },
        { comment_id: 'c2', like_count: 0, liked_by_me: false },
      ],
      error: null,
    });
    await done;
    expect(social().commentLikesReady.p).toBe(true);
    expect(likesOf('c1')).toEqual({ liked: true, count: 3 });
    expect(likesOf('c2')).toEqual({ liked: false, count: 0 });
  });

  it('opening again reads them fresh (hidden until they arrive)', async () => {
    mocked.getCommentLikes.mockResolvedValueOnce({
      data: [{ comment_id: 'c1', like_count: 3, liked_by_me: true }],
      error: null,
    });
    await social().loadCommentLikes('p');
    mocked.getCommentLikes.mockResolvedValueOnce({
      data: [{ comment_id: 'c1', like_count: 5, liked_by_me: true }],
      error: null,
    });
    const again = social().loadCommentLikes('p');
    expect(social().commentLikesReady.p).toBe(false);
    await again;
    expect(likesOf('c1')).toEqual({ liked: true, count: 5 });
  });

  it('a failed load keeps the hearts hidden', async () => {
    mocked.getCommentLikes.mockResolvedValue({ data: null, error: new Error('offline') });
    await social().loadCommentLikes('p');
    expect(social().commentLikesReady.p).toBe(false);
  });

  it('a comment with no likes reads as none', () => {
    expect(likesOf('new')).toEqual({ liked: false, count: 0 });
  });
});

describe('liking a comment', () => {
  beforeEach(async () => {
    mocked.getCommentLikes.mockResolvedValue({
      data: [{ comment_id: 'c1', like_count: 2, liked_by_me: false }],
      error: null,
    });
    await social().loadCommentLikes('p');
  });

  it('moves at once, then takes the server’s number', async () => {
    mocked.toggleCommentLike.mockResolvedValue({
      data: { liked: true, like_count: 4 },
      error: null,
    });
    const done = social().toggleCommentLike('c1');
    expect(likesOf('c1')).toEqual({ liked: true, count: 3 });
    await done;
    expect(likesOf('c1')).toEqual({ liked: true, count: 4 });
    expect(mocked.toggleCommentLike).toHaveBeenCalledWith('c1');
  });

  it('unliking takes one off', async () => {
    mocked.toggleCommentLike.mockResolvedValueOnce({
      data: { liked: true, like_count: 3 },
      error: null,
    });
    await social().toggleCommentLike('c1');
    mocked.toggleCommentLike.mockResolvedValueOnce({
      data: { liked: false, like_count: 2 },
      error: null,
    });
    const done = social().toggleCommentLike('c1');
    expect(likesOf('c1')).toEqual({ liked: false, count: 2 });
    await done;
  });

  it('a failed tap goes back and says so', async () => {
    mocked.toggleCommentLike.mockResolvedValue({ data: null, error: new Error('offline') });
    const result = await social().toggleCommentLike('c1');
    expect(likesOf('c1')).toEqual({ liked: false, count: 2 });
    expect(result.error).toBeInstanceOf(Error);
    expect(useToastStore.getState().message).toBe('Couldn’t like that comment. Try again.');
  });

  it('a comment still being sent cannot be liked yet', async () => {
    await social().toggleCommentLike('temp_1');
    expect(mocked.toggleCommentLike).not.toHaveBeenCalled();
    expect(likesOf('temp_1')).toEqual({ liked: false, count: 0 });
  });
});

describe('who liked a comment', () => {
  it('is read fresh every time and never kept', async () => {
    const likers = [
      { user_id: 'u1', username: 'ana', display_name: null, avatar_url: null, liked_at: '' },
    ];
    mocked.getCommentLikers.mockResolvedValue({ data: likers, error: null });
    expect((await social().getCommentLikers('c1')).data).toEqual(likers);
    await social().getCommentLikers('c1');
    expect(mocked.getCommentLikers).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(social())).not.toContain('ana');
  });
});

describe('sign-out', () => {
  it('reset clears comment likes', async () => {
    mocked.getCommentLikes.mockResolvedValue({
      data: [{ comment_id: 'c1', like_count: 2, liked_by_me: true }],
      error: null,
    });
    await social().loadCommentLikes('p');
    social().reset();
    expect(likesOf('c1')).toEqual({ liked: false, count: 0 });
    expect(social().commentLikesReady).toEqual({});
  });
});
