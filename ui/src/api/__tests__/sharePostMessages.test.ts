/**
 * Sharing a post into a chat (`share_post`), and reading it back (`get_messages` items carry
 * `post_id` and `post`). Missing fields read as absent, so an older server never crashes the chat.
 *
 * The mocks below are lifted above this import by jest; they only read `rpc` and
 * `createSignedUrls` when a test calls them.
 */
import { getMessages, sharePostToFriends } from '@/api/messages';

const rpc = jest.fn();
const createSignedUrls = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    storage: { from: () => ({ createSignedUrls: (...a: unknown[]) => createSignedUrls(...a) }) },
  },
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
// Saved copies of photos live on the phone (expo-file-system): not in these node tests.
jest.mock('@/lib/savedMedia', () => ({
  withSavedMedia: async (urls: Map<string, string>) => urls,
  forgetSavedMedia: async () => undefined,
}));

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  conversation_id: 'c1',
  sender_id: 'sam',
  content: '',
  client_id: null,
  created_at: `2026-10-10T10:00:0${id.slice(-1)}Z`,
  ...extra,
});

const feedItem = (id: string, path: string | null) => ({
  id,
  user_id: 'joe',
  created_at: '2026-10-09T08:00:00Z',
  post_date: '2026-10-09',
  streak_day: 3,
  locked: false,
  image_path: path,
  pov_image_path: null,
  caption: 'Leg day',
  latitude: null,
  longitude: null,
  like_count: 2,
  comment_count: 1,
  liked_by_me: false,
  tagged_users: [],
  response: null,
  profile: { id: 'joe', username: 'joe91', display_name: 'Joe', avatar_url: null },
});

beforeEach(() => {
  rpc.mockReset();
  createSignedUrls.mockReset();
});

describe('sharePostToFriends', () => {
  it('sends the post, the friends, a client id and the note', async () => {
    const answer = {
      sent: [{ user_id: 'a', conversation_id: 'c1', status: 'active' }],
      skipped: [],
    };
    rpc.mockResolvedValue({ data: answer, error: null });
    await expect(sharePostToFriends('p1', ['a'], 'cid-1', 'Look at this')).resolves.toEqual({
      data: { sent: ['a'], skipped: [] },
      error: null,
    });
    expect(rpc).toHaveBeenLastCalledWith('share_post', {
      p_post: 'p1',
      p_recipients: ['a'],
      p_client_id: 'cid-1',
      p_note: 'Look at this',
    });
  });

  it('an empty note goes as none', async () => {
    rpc.mockResolvedValue({ data: { sent: [], skipped: ['a'] }, error: null });
    const { data } = await sharePostToFriends('p1', ['a'], 'cid-1', '   ');
    expect(rpc.mock.calls[0][1].p_note).toBeNull();
    expect(data).toEqual({ sent: [], skipped: ['a'] });
  });

  it('a refusal comes back as an error with the server’s words', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'post not found', code: '42501' } });
    const { data, error } = await sharePostToFriends('p1', ['a'], 'cid-1', null);
    expect(data).toBeNull();
    expect(error?.message).toBe('post not found');
  });
});

describe('getMessages with posts', () => {
  it('a plain message stays as it was (and an older server sends no post fields)', async () => {
    rpc.mockResolvedValue({ data: [row('m1', { content: 'hi' })], error: null });
    const { data } = await getMessages('c1');
    expect(data).toHaveLength(1);
    expect(data?.[0].content).toBe('hi');
    expect(data?.[0].post ?? null).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('a post you can see arrives with its photo link signed, like a feed post', async () => {
    rpc.mockResolvedValue({
      data: [
        row('m1', {
          post_id: 'p1',
          post: { id: 'p1', available: true, item: feedItem('p1', 'joe/p1_rear.jpg') },
        }),
      ],
      error: null,
    });
    createSignedUrls.mockResolvedValue({
      data: [{ path: 'joe/p1_rear.jpg', signedUrl: 'https://signed/p1' }],
      error: null,
    });
    const { data, error } = await getMessages('c1');
    expect(error).toBeNull();
    const post = data?.[0].post;
    expect(post?.available).toBe(true);
    if (post?.available) {
      expect(post.post.image_url).toBe('https://signed/p1');
      expect(post.post.profiles.username).toBe('joe91');
      expect(post.post.caption).toBe('Leg day');
    }
  });

  it('a post you can’t see keeps its reason and asks for no photo', async () => {
    rpc.mockResolvedValue({
      data: [row('m1', { post_id: 'p1', post: { id: 'p1', available: false, reason: 'locked' } })],
      error: null,
    });
    const { data } = await getMessages('c1');
    expect(data?.[0].post).toEqual({ id: 'p1', available: false, reason: 'locked' });
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('a photo link that can’t be made leaves the chat readable', async () => {
    rpc.mockResolvedValue({
      data: [
        row('m2', { content: 'still here' }),
        // A photo this phone has no link for yet (links are reused for most of their hour).
        row('m1', {
          post_id: 'p9',
          post: { id: 'p9', available: true, item: feedItem('p9', 'joe/p9_rear.jpg') },
        }),
      ],
      error: null,
    });
    createSignedUrls.mockResolvedValue({ data: null, error: { message: 'storage down' } });
    const { data, error } = await getMessages('c1');
    expect(error).toBeNull();
    // Oldest first, as the screen reads.
    expect(data?.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(data?.[0].post).toEqual({ id: 'p9', available: false, reason: 'error' });
    expect(data?.[1].content).toBe('still here');
  });

  it('a post the server sent with no photo to show reads as couldn’t load', async () => {
    rpc.mockResolvedValue({
      data: [
        row('m1', {
          post_id: 'p1',
          post: { id: 'p1', available: true, item: feedItem('p1', null) },
        }),
      ],
      error: null,
    });
    const { data } = await getMessages('c1');
    expect(data?.[0].post).toEqual({ id: 'p1', available: false, reason: 'error' });
  });

  it('a post id with no post beside it (an older server) is left for the plain bubble', async () => {
    rpc.mockResolvedValue({ data: [row('m1', { post_id: 'p1' })], error: null });
    const { data } = await getMessages('c1');
    expect(data?.[0].post_id).toBe('p1');
    expect(data?.[0].post ?? null).toBeNull();
  });
});
