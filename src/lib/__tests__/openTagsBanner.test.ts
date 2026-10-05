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

  it('says time is up rather than a negative time', () => {
    expect(
      openTagsBanner({ openTags: [tag('sam', -MIN)], serverOffsetMs: 0, deviceNow })?.left
    ).toBe('time is up');
  });

  it('shows nothing without open tags', () => {
    expect(openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow })).toBeNull();
  });

  it('a first post needs no tag: says so when nothing is open', () => {
    expect(openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow, firstPost: true })).toEqual(
      { who: 'First post', left: 'no tag needed', firstPost: true }
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
});
