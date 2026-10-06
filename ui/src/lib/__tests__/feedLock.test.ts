import { clockText, feedCountdown, lockExplainer, lockedPostText, timeLeftText } from '../feedLock';

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const deviceNow = Date.parse('2026-10-01T12:00:00.000Z');
const at = (ms: number) => new Date(deviceNow + ms).toISOString();

const tag = (username: string, expiresIn: number) => ({ username, expires_at: at(expiresIn) });

describe('timeLeftText', () => {
  it.each([
    [41 * HOUR + 30 * MIN, '41 hours'],
    [HOUR + 59 * MIN, '1 hour'],
    [59 * MIN + 30 * 1000, '60 minutes'],
    [25 * MIN, '25 minutes'],
    [30 * 1000, '1 minute'],
  ])('%i ms reads as %s', (ms, expected) => {
    expect(timeLeftText(ms)).toBe(expected);
  });

  it('says nothing once the time is up, never a negative time', () => {
    expect(timeLeftText(0)).toBeNull();
    expect(timeLeftText(-5 * MIN)).toBeNull();
  });
});

describe('lockExplainer', () => {
  const base = { locked: true, unlockedUntil: at(-2 * HOUR), serverOffsetMs: 0, deviceNow };

  it('shows nothing while the feed is open', () => {
    expect(lockExplainer({ ...base, locked: false, openTags: [tag('sam', HOUR)] })).toBeNull();
  });

  it('names the friend whose tag runs out first, with time left on the server clock', () => {
    const card = lockExplainer({
      ...base,
      // Server is 1 hour ahead of the phone: sam's 42h on the phone is 41h on the server.
      serverOffsetMs: HOUR,
      openTags: [tag('alex', 46 * HOUR), tag('sam', 42 * HOUR + 30 * MIN)],
    });
    expect(card).toEqual({
      headline: '@sam and 1 other tagged you.',
      body: 'Your feed is locked until you post your answer. 41 hours left.',
      button: 'Post your answer',
      target: 'camera',
    });
  });

  it('one tag: just the friend', () => {
    expect(lockExplainer({ ...base, openTags: [tag('sam', 41 * HOUR + MIN)] })?.headline).toBe(
      '@sam tagged you.'
    );
  });

  it('three tags: "and 2 others"', () => {
    const card = lockExplainer({
      ...base,
      openTags: [tag('a', 30 * HOUR), tag('sam', 10 * HOUR), tag('b', 20 * HOUR)],
    });
    expect(card?.headline).toBe('@sam and 2 others tagged you.');
  });

  it('drops the time when the deadline has passed', () => {
    const card = lockExplainer({ ...base, openTags: [tag('sam', -MIN)] });
    expect(card?.body).toBe('Your feed is locked until you post your answer.');
  });

  it('never posted: asks for a first workout, and says any workout counts', () => {
    expect(lockExplainer({ ...base, unlockedUntil: null, openTags: [] })).toEqual({
      headline: 'Your feed is locked.',
      body: 'Post your first workout to see what your friends are doing. Any workout counts.',
      button: 'Post a workout',
      target: 'camera',
    });
  });

  it('posted before but no open tag: says how it opens, and offers Find friends', () => {
    const card = lockExplainer({ ...base, openTags: [] });
    expect(card).toEqual({
      headline: 'Your feed is locked.',
      body: 'It opens when a friend tags you and you post your answer. More friends means more tags.',
      button: 'Find friends',
      target: 'friends',
    });
  });
});

// Founder, 2026-10-05: the open feed shows a live countdown in the camera banner's style, not a
// line of hours.
describe('clockText', () => {
  it('reads hours, minutes and seconds, always two digits', () => {
    expect(clockText(3 * 1000 + 2 * MIN + HOUR)).toBe('01:02:03');
    expect(clockText(24 * HOUR)).toBe('24:00:00');
  });

  it('rounds up a part second, and stops at zero', () => {
    expect(clockText(1)).toBe('00:00:01');
    expect(clockText(0)).toBe('00:00:00');
    expect(clockText(-5000)).toBe('00:00:00');
  });
});

describe('feedCountdown', () => {
  const base = { locked: false, serverOffsetMs: 0, deviceNow, openTags: [] };

  it('within the 24 hours: a clock, and the hours in words for VoiceOver', () => {
    expect(feedCountdown({ ...base, unlockedUntil: at(18 * HOUR + 20 * MIN) })).toEqual({
      label: 'Feed will lock in',
      ms: 18 * HOUR + 20 * MIN,
      spoken: 'Feed will lock in 18 hours.',
    });
  });

  it('under an hour: minutes in words', () => {
    expect(feedCountdown({ ...base, unlockedUntil: at(12 * MIN) })?.spoken).toBe(
      'Feed will lock in 12 minutes.'
    );
  });

  it('counts on the server clock, not the phone clock', () => {
    // Phone is 2 hours slow: the server is 2 hours further along.
    expect(
      feedCountdown({ ...base, serverOffsetMs: 2 * HOUR, unlockedUntil: at(5 * HOUR + MIN) })?.ms
    ).toBe(3 * HOUR + MIN);
  });

  it('after the 24 hours but not locked: open until a tag, no clock', () => {
    expect(feedCountdown({ ...base, unlockedUntil: at(-MIN) })).toEqual({
      label: 'Your feed stays open until a friend tags you.',
      ms: null,
      spoken: 'Your feed stays open until a friend tags you.',
    });
  });

  it('tagged while open: who tagged you, and the clock to the lock', () => {
    expect(
      feedCountdown({
        ...base,
        unlockedUntil: at(18 * HOUR + 20 * MIN),
        openTags: [tag('sam', 40 * HOUR)],
      })
    ).toEqual({
      label: 'Feed will lock in',
      ms: 18 * HOUR + 20 * MIN,
      spoken: '@sam tagged you. Feed will lock in 18 hours unless you post your answer.',
    });
  });

  it('tagged by several: names the soonest deadline, counts the rest', () => {
    expect(
      feedCountdown({
        ...base,
        unlockedUntil: at(12 * MIN),
        openTags: [tag('alex', 46 * HOUR), tag('sam', 30 * HOUR)],
      })?.label
    ).toBe('Feed will lock in');
  });

  it('tagged after the 24 hours ended: no clock to give', () => {
    expect(
      feedCountdown({ ...base, unlockedUntil: at(-MIN), openTags: [tag('sam', 47 * HOUR)] })
    ).toEqual({
      label: '@sam tagged you. Your feed locks unless you post your answer.',
      ms: null,
      spoken: '@sam tagged you. Your feed locks unless you post your answer.',
    });
  });

  it('says nothing when locked or when there is no window', () => {
    expect(feedCountdown({ ...base, locked: true, unlockedUntil: at(HOUR) })).toBeNull();
    expect(feedCountdown({ ...base, unlockedUntil: null })).toBeNull();
  });
});

describe('lockedPostText', () => {
  it('tagged: opens when you post your answer', () => {
    expect(lockedPostText({ tagged: true, postedBefore: true })).toEqual({
      hint: 'Opens when you post your answer',
      button: 'Post your answer',
    });
  });

  it('never posted: the first post is always allowed', () => {
    expect(lockedPostText({ tagged: false, postedBefore: false })).toEqual({
      hint: 'Post your first workout to see it',
      button: 'Post a workout',
    });
  });

  it('never posted: the button says the same as the lock card above it', () => {
    const card = lockExplainer({
      locked: true,
      unlockedUntil: null,
      openTags: [],
      serverOffsetMs: 0,
    });
    expect(lockedPostText({ tagged: false, postedBefore: false }).button).toBe(card?.button);
  });

  it('posted before, no open tag: no button, since there is nothing to post yet', () => {
    const text = lockedPostText({ tagged: false, postedBefore: true });
    expect(text).toEqual({ hint: 'Opens when a friend tags you' });
    expect(text).not.toHaveProperty('button');
  });
});
