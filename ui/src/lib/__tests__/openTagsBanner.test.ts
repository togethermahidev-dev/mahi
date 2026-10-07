import { bannerText, openTagsBanner } from '../openTagsBanner';

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const deviceNow = Date.parse('2026-10-01T12:00:00.000Z');
const at = (ms: number) => new Date(deviceNow + ms).toISOString();
const tag = (username: string, expiresIn: number) => ({ username, expires_at: at(expiresIn) });

describe('openTagsBanner — someone who downloaded Mahi themselves (Type B)', () => {
  it('asks for the first Mahi, promises the first point and asks for 3 mates', () => {
    const b = openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow, firstPost: true });
    expect(b && bannerText(b)).toBe(
      'Post your first Mahi to get your first point and tag 3 mates.'
    );
    expect(b?.firstPost).toBe(true);
    expect(b?.note).toBe('Any workout counts, even 10 minutes.');
  });

  it('shows nothing to someone who has posted and has no tag', () => {
    expect(openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow })).toBeNull();
  });
});

describe('openTagsBanner — someone a mate tagged, before their first post (Type A)', () => {
  it('names the mate and ticks down in hours, minutes and seconds', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 47 * HOUR + 59 * MIN + 59 * 1000)],
      serverOffsetMs: 0,
      deviceNow,
      firstPost: true,
    });
    expect(b && bannerText(b)).toBe(
      'You were tagged by @sam. You have 47:59:59 to post your Mahi and get your first point.'
    );
    expect(b?.parts.find((p) => p.accent)?.text).toBe('47:59:59');
  });

  it('several mates: one first post answers them all', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 47 * HOUR), tag('ali', 40 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      firstPost: true,
    });
    expect(b && bannerText(b)).toBe(
      'You were tagged by @ali +1. You have 40:00:00 to post your Mahi and get your first point.'
    );
    expect(b?.note).toBe('One post answers both tags. Any workout counts, even 10 minutes.');
  });
});

describe('openTagsBanner — tagged after that', () => {
  it('says who, with a ticking clock, and that answering earns a point', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 41 * HOUR + 20 * MIN)],
      serverOffsetMs: 0,
      deviceNow,
    });
    expect(b && bannerText(b)).toBe('@sam tagged you · 41:20:00 left');
    expect(b?.note).toBe('Post your answer to earn a Mahi point.');
  });

  it('one workout answers several tags for one point', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 2 * HOUR), tag('ali', 3 * HOUR), tag('kim', 4 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
    });
    expect(b && bannerText(b)).toBe('@sam +2 tagged you · 02:00:00 left');
    expect(b?.note).toBe('One workout answers all 3 tags and earns 1 point.');
  });

  it('reads the time on the server clock', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 3 * HOUR)],
      serverOffsetMs: 2 * HOUR,
      deviceNow,
    });
    expect(b && bannerText(b)).toBe('@sam tagged you · 01:00:00 left');
  });

  it('says last minutes in the grace time, never missed before the server does', () => {
    const tagged = openTagsBanner({ openTags: [tag('sam', -MIN)], serverOffsetMs: 0, deviceNow });
    expect(tagged && bannerText(tagged)).toBe('@sam tagged you · last minutes');
    const first = openTagsBanner({
      openTags: [tag('sam', -MIN)],
      serverOffsetMs: 0,
      deviceNow,
      firstPost: true,
    });
    expect(first && bannerText(first)).toBe(
      'You were tagged by @sam. You have only minutes to post your Mahi and get your first point.'
    );
  });
});
