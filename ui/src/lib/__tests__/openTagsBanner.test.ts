import { openTagsBanner } from '../openTagsBanner';

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const deviceNow = Date.parse('2026-10-01T12:00:00.000Z');
const at = (ms: number) => new Date(deviceNow + ms).toISOString();
const tag = (username: string, expiresIn: number) => ({ username, expires_at: at(expiresIn) });

describe('openTagsBanner', () => {
  it('says who and the time left the way the feed does, in hours', () => {
    expect(
      openTagsBanner({ openTags: [tag('sam', 41 * HOUR + 20 * MIN)], serverOffsetMs: 0, deviceNow })
    ).toEqual({ who: '@sam', left: '41 hours left' });
  });

  it('counts down in minutes in the last hour', () => {
    expect(
      openTagsBanner({ openTags: [tag('sam', 25 * MIN)], serverOffsetMs: 0, deviceNow })?.left
    ).toBe('25 minutes left');
  });

  it('adds how many others tagged you', () => {
    expect(
      openTagsBanner({
        openTags: [tag('sam', 2 * HOUR), tag('ali', 3 * HOUR)],
        serverOffsetMs: 0,
        deviceNow,
      })?.who
    ).toBe('@sam +1');
  });

  it('reads the time on the server clock', () => {
    expect(
      openTagsBanner({ openTags: [tag('sam', 3 * HOUR)], serverOffsetMs: 2 * HOUR, deviceNow })
        ?.left
    ).toBe('1 hour left');
  });

  it('says last minutes in the grace time, never missed before the server does', () => {
    expect(
      openTagsBanner({ openTags: [tag('sam', -MIN)], serverOffsetMs: 0, deviceNow })?.left
    ).toBe('last minutes');
  });

  it('shows nothing without open tags', () => {
    expect(openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow })).toBeNull();
  });

  it('a first post needs no tag: says so when nothing is open', () => {
    expect(openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow, firstPost: true })).toEqual(
      {
        who: 'First post',
        left: 'no tag needed',
        firstPost: true,
        note: 'Any workout counts, even 10 minutes.',
      }
    );
    expect(
      openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow, firstPost: false })
    ).toBeNull();
  });

  it('open tags win over the first-post pill', () => {
    expect(
      openTagsBanner({
        openTags: [tag('sam', 41 * HOUR)],
        serverOffsetMs: 0,
        deviceNow,
        firstPost: true,
      })?.who
    ).toBe('@sam');
  });

  it('one friend: no extra line', () => {
    expect(
      openTagsBanner({ openTags: [tag('sam', 2 * HOUR)], serverOffsetMs: 0, deviceNow })?.note
    ).toBeUndefined();
  });

  it('tagged by several friends: one workout answers them all', () => {
    expect(
      openTagsBanner({
        openTags: [tag('sam', 2 * HOUR), tag('ali', 3 * HOUR), tag('jo', 4 * HOUR)],
        serverOffsetMs: 0,
        deviceNow,
      })?.note
    ).toBe('One workout answers all 3 tags.');
    expect(
      openTagsBanner({
        openTags: [tag('sam', 2 * HOUR), tag('ali', 3 * HOUR)],
        serverOffsetMs: 0,
        deviceNow,
      })?.note
    ).toBe('One workout answers both tags.');
  });

  it('a newcomer answering their first tag hears whose tag it answers, and that any workout counts', () => {
    expect(
      openTagsBanner({
        openTags: [tag('sam', 47 * HOUR)],
        serverOffsetMs: 0,
        deviceNow,
        firstPost: true,
      })?.note
    ).toBe('Your first post answers @sam’s tag. Any workout counts, even 10 minutes.');
    // Several tags: one first post answers them all.
    expect(
      openTagsBanner({
        openTags: [tag('sam', 47 * HOUR), tag('ali', 40 * HOUR)],
        serverOffsetMs: 0,
        deviceNow,
        firstPost: true,
      })?.note
    ).toBe('Your first post answers both tags. Any workout counts, even 10 minutes.');
  });
});
