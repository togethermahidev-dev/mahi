import { tagsFromFeed } from '../feedLockReason';

// Owner, 2026-10-09: "if it's locked it'll know surely?" The feed read carries your open tags
// (20261009120000_feed_lock_reason), so a locked feed knows why without a second read.
describe('tagsFromFeed — the open tags that ride on the feed read', () => {
  const tag = {
    challenge_id: 'c1',
    tagger_id: 't1',
    username: 'sam',
    display_name: null,
    avatar_url: null,
    created_at: '2026-10-09T10:00:00Z',
    expires_at: '2026-10-11T10:00:00Z',
    server_now: '2026-10-09T15:00:00Z',
  };
  it('passes the tags through', () => {
    expect(tagsFromFeed([tag])).toEqual([tag]);
  });
  it('an empty list means no tags (known)', () => {
    expect(tagsFromFeed([])).toEqual([]);
  });
  it('an older server sends nothing: unknown, not "no tags"', () => {
    expect(tagsFromFeed(undefined)).toBeNull();
    expect(tagsFromFeed(null)).toBeNull();
  });
  it('drops rows missing who or when', () => {
    expect(tagsFromFeed([{ ...tag, username: undefined }, { ...tag, expires_at: null }])).toEqual([]);
  });
});
