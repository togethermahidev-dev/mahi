import {
  clockText,
  feedCountdown,
  lockedGapContent,
  lockExplainer,
  lockPill,
  timeLeftText,
} from '../feedLock';

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
    // Core workflow step 17 (owner, 2026-10-09): "You've been tagged. Post your Mahi to access
    // your feed", with the clock of the tag that runs out first.
    expect(card).toEqual({
      headline: 'You’ve been tagged.',
      body: 'Post your Mahi to access your feed. 41:30:00 left.',
      button: 'Post your answer',
      target: 'camera',
    });
  });

  it('one tag or several: the same words, the soonest clock', () => {
    expect(lockExplainer({ ...base, openTags: [tag('sam', 41 * HOUR + MIN)] })?.body).toBe(
      'Post your Mahi to access your feed. 41:01:00 left.'
    );
    const card = lockExplainer({
      ...base,
      openTags: [tag('a', 30 * HOUR), tag('sam', 10 * HOUR), tag('b', 20 * HOUR)],
    });
    expect(card?.headline).toBe('You’ve been tagged.');
    expect(card?.body).toBe('Post your Mahi to access your feed. 10:00:00 left.');
  });

  it('drops the time when the deadline has passed', () => {
    const card = lockExplainer({ ...base, openTags: [tag('sam', -MIN)] });
    expect(card?.body).toBe('Post your Mahi to access your feed.');
  });

  it('never posted: asks for a first workout, and says any workout counts', () => {
    expect(lockExplainer({ ...base, unlockedUntil: null, openTags: [] })).toEqual({
      headline: 'Your first move: show up.',
      body: 'Post one workout to earn your first point and open your feed. Any movement counts.',
      button: 'Start first workout',
      target: 'camera',
    });
  });

  it('posted before but no open tag: says how it opens, and offers Find friends', () => {
    const card = lockExplainer({ ...base, openTags: [] });
    expect(card).toEqual({
      headline: 'Ready for your next workout?',
      body: 'A friend’s tag unlocks your next check-in. Find accountability partners who will call you to show up.',
      button: 'Find accountability partners',
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
      label: 'Feed open · next tag locks it after',
      ms: 18 * HOUR + 20 * MIN,
      spoken: 'Feed open. The next tag locks it after 18 hours.',
    });
  });

  it('under an hour: minutes in words', () => {
    expect(feedCountdown({ ...base, unlockedUntil: at(12 * MIN) })?.spoken).toBe(
      'Feed open. The next tag locks it after 12 minutes.'
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
      label: 'Your feed is open. It will lock when a friend tags you.',
      ms: null,
      spoken: 'Your feed is open. It will lock when a friend tags you.',
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

// Owner, 2026-10-08: a locked feed is the real rows, blurred, with one small pill saying why and
// what to do; no big card.
describe('lockPill', () => {
  const base = { locked: true, unlockedUntil: at(-2 * HOUR), serverOffsetMs: 0, deviceNow };

  it('nothing while the feed is open', () => {
    expect(lockPill({ ...base, locked: false, openTags: [] })).toBeNull();
  });

  it('never posted: post a first workout', () => {
    expect(lockPill({ ...base, unlockedUntil: null, openTags: [] })).toEqual({
      line: 'Locked. Post your first workout to open it.',
      button: 'Start first workout',
      target: 'camera',
    });
  });

  it('tagged: post your Mahi to open it, with the time left', () => {
    expect(lockPill({ ...base, openTags: [tag('sam', 41 * HOUR + MIN)] })).toEqual({
      line: 'You’ve been tagged. Post your Mahi to access your feed. 41:01:00 left.',
      button: 'Post your answer',
      target: 'camera',
    });
  });

  it('tagged, past the deadline: no clock', () => {
    expect(lockPill({ ...base, openTags: [tag('sam', -MIN)] })?.line).toBe(
      'You’ve been tagged. Post your Mahi to access your feed.'
    );
  });

  it('posted, no tag: it opens when a friend tags you', () => {
    expect(lockPill({ ...base, openTags: [] })).toEqual({
      line: 'Locked until a friend tags you.',
      button: 'Find friends',
      target: 'friends',
    });
  });
});

// Owner, 2026-10-08: someone who has posted before (the server's mark) is never told to post a
// first workout, even when none of their posts is in the feed any more (unlockedUntil null).
describe('lockPill — posted before, no post in the feed now', () => {
  const base = { locked: true, unlockedUntil: null, serverOffsetMs: 0, deviceNow };
  it('says it opens with a friend’s tag, not "first workout"', () => {
    expect(lockPill({ ...base, openTags: [], postedBefore: true })).toEqual({
      line: 'Locked until a friend tags you.',
      button: 'Find friends',
      target: 'friends',
    });
  });
  it('never posted still asks for a first workout', () => {
    expect(lockPill({ ...base, openTags: [], postedBefore: false })?.button).toBe(
      'Start first workout'
    );
  });
});

// Owner, 2026-10-09: a locked feed lifted the camera over an empty grey panel. While the tags
// load, or when they couldn't be read, the panel still says something; it is never blank.
describe('lockedGapContent — the panel under a lifted, locked camera', () => {
  const pill = {
    line: 'Locked until a friend tags you.',
    button: 'Find friends',
    target: 'friends' as const,
  };
  it('says why and what to do once the tags are read', () => {
    expect(lockedGapContent({ pill, loaded: true, error: false })).toEqual({
      line: 'Locked until a friend tags you.',
      button: 'Find friends',
      action: 'friends',
      padlock: true,
    });
  });
  it('says it is checking while the tags load (no button)', () => {
    expect(lockedGapContent({ pill: null, loaded: false, error: false })).toEqual({
      line: 'Checking your tags…',
      button: null,
      action: null,
      padlock: true,
    });
  });
  it('offers Try again when the tags could not be read', () => {
    expect(lockedGapContent({ pill: null, loaded: false, error: true })).toEqual({
      line: 'Couldn’t reach Mahi.',
      button: 'Try again',
      action: 'retry',
      padlock: true,
    });
  });
});

// Owner, 2026-10-09 (second screenshot): before the feed itself has loaded, the swipe up showed an
// empty grey feed. Until it loads, the panel says so, and offers Try again if the read failed.
describe('lockedGapContent — before the feed has loaded', () => {
  it('says the feed is loading (no button, no padlock)', () => {
    expect(lockedGapContent({ pill: null, loaded: false, error: false, feed: 'loading' })).toEqual({
      line: 'Loading your feed…',
      button: null,
      action: null,
      padlock: false,
    });
  });
  it('offers Try again when the feed could not be read', () => {
    expect(lockedGapContent({ pill: null, loaded: false, error: false, feed: 'error' })).toEqual({
      line: 'Couldn’t load your feed.',
      button: 'Try again',
      action: 'retryFeed',
      padlock: false,
    });
  });
  it('a loaded, locked feed keeps its padlock', () => {
    const pill = {
      line: 'Locked until a friend tags you.',
      button: 'Find friends',
      target: 'friends' as const,
    };
    expect(lockedGapContent({ pill, loaded: true, error: false, feed: 'loaded' }).padlock).toBe(
      true
    );
  });
});
