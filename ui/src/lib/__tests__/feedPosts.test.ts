import { latestOwnPostOnly } from '../feedPosts';

const post = (id: string, owner: string) => ({ id, profiles: { id: owner } });

// Owner, 2026-10-07: the feed is the people you follow, newest first; of your own posts it shows
// only your latest, in its place by time. Older ones live on your Profile.
describe('latestOwnPostOnly', () => {
  it('keeps your newest post and drops your older ones', () => {
    const feed = [post('a', 'sam'), post('b', 'me'), post('c', 'ali'), post('d', 'me')];
    expect(latestOwnPostOnly(feed, 'me').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps everyone else’s posts in order', () => {
    const feed = [post('a', 'sam'), post('b', 'sam'), post('c', 'ali')];
    expect(latestOwnPostOnly(feed, 'me').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a post still uploading as your latest', () => {
    const feed = [post('new', 'me'), post('a', 'sam'), post('old', 'me')];
    expect(latestOwnPostOnly(feed, 'me').map((p) => p.id)).toEqual(['new', 'a']);
  });

  it('leaves the feed alone before you are known', () => {
    const feed = [post('b', 'me'), post('d', 'me')];
    expect(latestOwnPostOnly(feed, undefined)).toEqual(feed);
  });
});
