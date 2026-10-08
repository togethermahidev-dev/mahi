import {
  bannerText,
  matesOnClock,
  namesList,
  openTagReminder,
  openTagsBanner,
} from '../openTagsBanner';

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const deviceNow = Date.parse('2026-10-01T12:00:00.000Z');
const at = (ms: number) => new Date(deviceNow + ms).toISOString();
const tag = (username: string, expiresIn: number) => ({ username, expires_at: at(expiresIn) });

describe('openTagsBanner — someone who downloaded Mahi themselves (Type B)', () => {
  it('makes the first workout and first point clear', () => {
    const b = openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow, firstPost: true });
    expect(b && bannerText(b)).toBe('Show up with your first workout to earn your first point.');
    expect(b?.firstPost).toBe(true);
    expect(b?.note).toBe('Any workout counts, even 10 minutes.');
  });

  it('shows nothing to someone who has posted and has no tag', () => {
    expect(openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow })).toBeNull();
  });
});

describe('openTagsBanner — someone a friend tagged, before their first post (Type A)', () => {
  it('names the friend and ticks down in hours, minutes and seconds', () => {
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

  it('several friends: one first post answers them all', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 47 * HOUR), tag('ali', 40 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      firstPost: true,
    });
    expect(b && bannerText(b)).toBe(
      'You were tagged by @ali and 1 more. You have 40:00:00 to post your Mahi and get your first point.'
    );
    expect(b?.note).toBe('One post answers both tags. Any workout counts, even 10 minutes.');
  });
});

describe('openTagsBanner — tagged after that', () => {
  // Usability walkthrough 2026-10-07: say who is on the clock, and what a miss would cost.
  it('says who is waiting, with a ticking clock, and what answering and missing mean', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 41 * HOUR + 20 * MIN)],
      serverOffsetMs: 0,
      deviceNow,
      points: 4,
    });
    expect(b && bannerText(b)).toBe('@sam is waiting on you · 41:20:00 left');
    expect(b?.note).toBe('Answer to earn a point. Miss it and your 4 points go back to 0.');
  });

  it('one point: "your 1 point goes back to 0"', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 20 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      points: 1,
    });
    expect(b?.note).toBe('Answer to earn a point. Miss it and your 1 point goes back to 0.');
  });

  it('at 0 points (or not loaded yet) there is nothing to lose: just the point', () => {
    const zero = openTagsBanner({
      openTags: [tag('sam', 20 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      points: 0,
    });
    expect(zero?.note).toBe('Answer to earn a point.');
    const unknown = openTagsBanner({
      openTags: [tag('sam', 20 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
    });
    expect(unknown?.note).toBe('Answer to earn a point.');
  });

  it('one workout answers several tags for one point', () => {
    const b = openTagsBanner({
      // More than 6 hours left (under 6 the note turns into the reminder, below).
      openTags: [tag('sam', 7 * HOUR), tag('ali', 8 * HOUR), tag('kim', 9 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
    });
    expect(b && bannerText(b)).toBe('@sam and 2 more are waiting on you · 07:00:00 left');
    expect(b?.note).toBe('One workout answers all 3 tags and earns a point.');
    const withPoints = openTagsBanner({
      openTags: [tag('sam', 7 * HOUR), tag('ali', 8 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      points: 6,
    });
    expect(withPoints?.note).toBe(
      'One workout answers both tags and earns a point. Miss one and your 6 points go back to 0.'
    );
  });

  it('reads the time on the server clock', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 3 * HOUR)],
      serverOffsetMs: 2 * HOUR,
      deviceNow,
    });
    expect(b && bannerText(b)).toBe('@sam is waiting on you · 01:00:00 left');
  });

  it('says last minutes in the grace time, never missed before the server does', () => {
    const tagged = openTagsBanner({ openTags: [tag('sam', -MIN)], serverOffsetMs: 0, deviceNow });
    expect(tagged && bannerText(tagged)).toBe('@sam is waiting on you · last minutes');
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

// Owner, 2026-10-07: a quiet reminder when time is short — under 6 hours the clock turns the
// warning colour and the note names who's waiting.
describe('openTagsBanner — under 6 hours left', () => {
  it('turns urgent and says how long is left to answer whom', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 5 * HOUR + 59 * MIN + 59 * 1000)],
      serverOffsetMs: 0,
      deviceNow,
    });
    expect(b && bannerText(b)).toBe('@sam is waiting on you · 05:59:59 left');
    expect(b?.urgent).toBe(true);
    expect(b?.note).toBe('Only 05:59:59 left to answer @sam.');
  });

  it('is not urgent at 6 hours or more', () => {
    const b = openTagsBanner({ openTags: [tag('sam', 6 * HOUR)], serverOffsetMs: 0, deviceNow });
    expect(b?.urgent).toBeUndefined();
    expect(b?.note).toBe('Answer to earn a point.');
  });

  it('names the friend whose tag ends first', () => {
    const b = openTagsBanner({
      openTags: [tag('ali', 9 * HOUR), tag('sam', 2 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
    });
    expect(b?.urgent).toBe(true);
    expect(b?.note).toBe('Only 02:00:00 left to answer @sam.');
  });

  it('in the grace time: only minutes left', () => {
    const b = openTagsBanner({ openTags: [tag('sam', -MIN)], serverOffsetMs: 0, deviceNow });
    expect(b?.urgent).toBe(true);
    expect(b?.note).toBe('Only minutes left to answer @sam.');
  });

  it('a first post: the clock turns urgent, the note stays the welcome one', () => {
    const b = openTagsBanner({
      openTags: [tag('sam', 3 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      firstPost: true,
    });
    expect(b?.urgent).toBe(true);
    expect(b?.note).toBe('Any workout counts, even 10 minutes.');
  });

  it('a first post with no tag is never urgent', () => {
    const b = openTagsBanner({ openTags: [], serverOffsetMs: 0, deviceNow, firstPost: true });
    expect(b?.urgent).toBeUndefined();
  });
});

describe('openTagReminder — the in-app nudge when Mahi opens', () => {
  const base = {
    serverOffsetMs: 0,
    deviceNow,
    page: 'feed' as const,
    quiet: false,
    reminded: false,
  };

  it('says whose tag and the time left', () => {
    expect(
      openTagReminder({ ...base, openTags: [tag('sam', 5 * HOUR + 12 * MIN + 33 * 1000)] })
    ).toBe('@sam’s tag: 05:12:33 left');
  });

  it('names the tag that ends first', () => {
    expect(
      openTagReminder({ ...base, openTags: [tag('ali', 30 * HOUR), tag('sam', 20 * HOUR)] })
    ).toBe('@sam’s tag: 20:00:00 left');
  });

  it('in the grace time: last minutes', () => {
    expect(openTagReminder({ ...base, openTags: [tag('sam', -MIN)] })).toBe(
      '@sam’s tag: last minutes'
    );
  });

  it('nothing without an open tag', () => {
    expect(openTagReminder({ ...base, openTags: [] })).toBeNull();
  });

  it('nothing on the camera or while posting, which already show the tag', () => {
    const openTags = [tag('sam', 2 * HOUR)];
    expect(openTagReminder({ ...base, openTags, page: 'camera' })).toBeNull();
    expect(openTagReminder({ ...base, openTags, page: 'compose' })).toBeNull();
  });

  it('at most once per app open', () => {
    const openTags = [tag('sam', 2 * HOUR)];
    expect(openTagReminder({ ...base, openTags, reminded: true })).toBeNull();
  });

  it('waits while something else is on screen', () => {
    const openTags = [tag('sam', 2 * HOUR)];
    expect(openTagReminder({ ...base, openTags, quiet: true })).toBeNull();
  });
});

describe('namesList — friends by name', () => {
  it('joins one, two, three and more', () => {
    expect(namesList(['a'])).toBe('@a');
    expect(namesList(['a', 'b'])).toBe('@a and @b');
    expect(namesList(['a', 'b', 'c'])).toBe('@a, @b and @c');
    expect(namesList(['a', 'b', 'c', 'd', 'e'])).toBe('@a, @b, @c and 2 more');
    expect(namesList(['a', 'b', 'c', 'd'])).toBe('@a, @b, @c and 1 more');
  });
});

// Usability walkthrough 2026-10-07: the waiting camera says whose 48 hours are running.
describe('matesOnClock — the waiting card while your own tags are open', () => {
  const mate = (username: string, expiresIn: number) => ({ username, expires_at: at(expiresIn) });

  it('names your friends and the soonest clock', () => {
    expect(
      matesOnClock({
        mates: [mate('b', 40 * HOUR), mate('a', 31 * HOUR + 12 * MIN), mate('c', 45 * HOUR)],
        serverOffsetMs: 0,
        deviceNow,
      })
    ).toEqual({
      title: 'Your friends are on the clock',
      line: '@a, @b and @c have 31:12:00 to answer you.',
    });
  });

  it('one friend: "has"', () => {
    expect(
      matesOnClock({ mates: [mate('sam', 2 * HOUR)], serverOffsetMs: 0, deviceNow })?.line
    ).toBe('@sam has 02:00:00 to answer you.');
  });

  it('reads the server clock, and says only minutes in the grace time', () => {
    expect(
      matesOnClock({ mates: [mate('sam', 3 * HOUR)], serverOffsetMs: HOUR, deviceNow })?.line
    ).toBe('@sam has 02:00:00 to answer you.');
    expect(matesOnClock({ mates: [mate('sam', -MIN)], serverOffsetMs: 0, deviceNow })?.line).toBe(
      '@sam has only minutes left to answer you.'
    );
  });

  it('nothing when no friend is on the clock (the card keeps "Waiting for a friend to tag you")', () => {
    expect(matesOnClock({ mates: [], serverOffsetMs: 0, deviceNow })).toBeNull();
  });
});
