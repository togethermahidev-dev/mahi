import { answersATag, hasPostedBefore, reactivePostingGate } from '../reactivePosting';

const HOUR = 3600 * 1000;
const deviceNow = Date.parse('2026-10-01T12:00:00.000Z');
const tag = (expiresIn: number) => ({ expires_at: new Date(deviceNow + expiresIn).toISOString() });

describe('answersATag — a post now answers a friend’s tag', () => {
  it('yes while a tag is still open', () => {
    expect(answersATag([tag(-HOUR), tag(2 * HOUR)], 0, deviceNow)).toBe(true);
  });

  it('no when every tag has run out, or there are none', () => {
    expect(answersATag([tag(-HOUR), tag(0)], 0, deviceNow)).toBe(false);
    expect(answersATag([], 0, deviceNow)).toBe(false);
  });

  it('measures on the server clock, not the phone’s', () => {
    // 30 minutes left on the phone, but the server is an hour ahead: already gone.
    expect(answersATag([tag(HOUR / 2)], HOUR, deviceNow)).toBe(false);
  });
});

describe('reactivePostingGate — whether the camera lets you post', () => {
  const base = { tagsLoaded: true, openTags: [], serverOffsetMs: 0, deviceNow };

  it('your very first post is always allowed, even before tags load', () => {
    expect(reactivePostingGate({ ...base, hasPosted: false, tagsLoaded: false })).toBe('open');
  });

  it('after that, only while a friend’s tag is open', () => {
    expect(reactivePostingGate({ ...base, hasPosted: true, openTags: [tag(HOUR)] })).toBe('open');
    expect(reactivePostingGate({ ...base, hasPosted: true, openTags: [] })).toBe('closed');
    expect(reactivePostingGate({ ...base, hasPosted: true, openTags: [tag(-HOUR)] })).toBe(
      'closed'
    );
  });

  it('loading until both answers are in — never a guess', () => {
    expect(reactivePostingGate({ ...base, hasPosted: null })).toBe('loading');
    expect(reactivePostingGate({ ...base, hasPosted: true, tagsLoaded: false })).toBe('loading');
  });
});

describe('hasPostedBefore — whether your first workout is posted', () => {
  it('stays used after you delete every post (the server’s permanent mark wins)', () => {
    expect(hasPostedBefore({ profileMark: true, feedLoaded: true, unlockedUntil: null })).toBe(
      true
    );
  });

  it('is used as soon as a post of yours exists, before the profile catches up', () => {
    expect(
      hasPostedBefore({
        profileMark: false,
        feedLoaded: true,
        unlockedUntil: '2026-10-08T12:00:00Z',
      })
    ).toBe(true);
  });

  it('is free only when both say you never posted', () => {
    expect(hasPostedBefore({ profileMark: false, feedLoaded: true, unlockedUntil: null })).toBe(
      false
    );
  });

  it('is unknown until both the profile and the feed are read', () => {
    expect(hasPostedBefore({ profileMark: null, feedLoaded: true, unlockedUntil: null })).toBe(
      null
    );
    expect(hasPostedBefore({ profileMark: false, feedLoaded: false, unlockedUntil: null })).toBe(
      null
    );
  });
});
