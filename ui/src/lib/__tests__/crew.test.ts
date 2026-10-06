import { crewStrip } from '../crew';

const HOUR = 3600 * 1000;
const deviceNow = Date.parse('2026-10-06T12:00:00.000Z');
const at = (ms: number) => new Date(deviceNow + ms).toISOString();
const openTag = (id: string, expiresIn: number) => ({
  tagger_id: id,
  username: id,
  display_name: null,
  avatar_url: null,
  expires_at: at(expiresIn),
});
const person = (id: string) => ({
  user_id: id,
  username: id,
  display_name: null,
  avatar_url: null,
});
const post = (
  authorId: string,
  createdAgo: number,
  extra: { tagged?: string[]; answered?: string } = {}
) => ({
  created_at: at(-createdAgo),
  profiles: { id: authorId, username: authorId, display_name: null, avatar_url: null },
  tagged_users: (extra.tagged ?? []).map(person),
  response: extra.answered ? { tagger_username: extra.answered, seconds: 60 } : null,
});

const base = { me: { id: 'me', username: 'me' }, serverOffsetMs: 0, deviceNow };

describe('crewStrip', () => {
  it('is empty when nobody is tied to you', () => {
    expect(crewStrip({ ...base, openTags: [], posts: [] })).toEqual([]);
  });

  it('shows who is waiting on you with the time left, soonest first', () => {
    const crew = crewStrip({
      ...base,
      openTags: [openTag('ali', 9 * HOUR), openTag('sam', 3 * HOUR)],
      posts: [],
    });
    expect(crew.map((c) => [c.id, c.status, c.line])).toEqual([
      ['sam', 'waiting', '3 hours left'],
      ['ali', 'waiting', '9 hours left'],
    ]);
  });

  it('shows the friends you tagged on your latest post, and who answered', () => {
    const crew = crewStrip({
      ...base,
      openTags: [],
      posts: [
        post('kim', 1 * HOUR, { answered: 'me' }),
        post('me', 5 * HOUR, { tagged: ['kim', 'jo'] }),
        post('me', 50 * HOUR, { tagged: ['old'] }),
      ],
    });
    expect(crew.map((c) => [c.id, c.status, c.line])).toEqual([
      ['kim', 'answered', 'Answered you'],
      ['jo', 'open', 'Your tag'],
    ]);
  });

  it('ignores answers from before your latest post', () => {
    const crew = crewStrip({
      ...base,
      openTags: [],
      posts: [post('me', 5 * HOUR, { tagged: ['kim'] }), post('kim', 9 * HOUR, { answered: 'me' })],
    });
    expect(crew[0].status).toBe('open');
  });

  it('keeps one entry per friend and never more than three', () => {
    const crew = crewStrip({
      ...base,
      openTags: [openTag('kim', 2 * HOUR)],
      posts: [post('me', 1 * HOUR, { tagged: ['kim', 'a', 'b', 'c'] })],
    });
    expect(crew.map((c) => c.id)).toEqual(['kim', 'a', 'b']);
  });
});
