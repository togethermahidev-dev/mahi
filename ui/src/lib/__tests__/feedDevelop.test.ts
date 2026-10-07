import { MOTION } from '@/constants/tokens';
import { developDelay, developPlan, developWords } from '../feedDevelop';

type Post = Parameters<typeof developPlan>[0]['posts'][number];

const post = (id: string, username: string, extra: Partial<Post> = {}): Post => ({
  id,
  locked: false,
  profiles: { id: `u-${username}`, username },
  response: null,
  ...extra,
});

describe('feed develop (your mates’ posts clear one by one after you answer)', () => {
  const viewerId = 'u-me';
  const mine = post('mine', 'me', {
    profiles: { id: viewerId, username: 'me' },
    response: { tagger_username: 'sam', seconds: 10 },
  });

  describe('developDelay: the stagger', () => {
    it('clears the first at once and each next one a beat later', () => {
      expect(developDelay(0)).toBe(0);
      expect(developDelay(1)).toBe(MOTION.develop.staggerMs);
      expect(developDelay(3)).toBe(3 * MOTION.develop.staggerMs);
    });
    it('stops staggering after a few, so a long feed never waits', () => {
      expect(developDelay(MOTION.develop.staggerMax + 5)).toBe(
        MOTION.develop.staggerMax * MOTION.develop.staggerMs
      );
    });
    it('clears everything together with Reduce Motion', () => {
      expect(developDelay(4, true)).toBe(0);
    });
  });

  describe('developPlan: which posts, in which order', () => {
    const posts = [mine, post('a', 'jo'), post('b', 'sam'), post('c', 'al')];

    it('develops the posts that were locked, in feed order, the tagger’s first', () => {
      const plan = developPlan({ posts, previouslyLocked: ['a', 'b', 'c'], viewerId });
      expect([...plan.entries()]).toEqual([
        ['b', 0],
        ['a', MOTION.develop.staggerMs],
        ['c', 2 * MOTION.develop.staggerMs],
      ]);
    });
    it('never develops your own post, or one that was never locked', () => {
      const plan = developPlan({ posts, previouslyLocked: ['mine', 'a'], viewerId });
      expect([...plan.entries()]).toEqual([['a', 0]]);
    });
    it('ignores posts no longer in the feed, and posts still locked', () => {
      const still = [mine, post('c', 'al'), post('d', 'bo', { locked: true })];
      const plan = developPlan({ posts: still, previouslyLocked: ['gone', 'c', 'd'], viewerId });
      expect([...plan.keys()]).toEqual(['c']);
    });
    it('keeps feed order when your newest post answered no tag', () => {
      const plain = posts.map((p) => ({ ...p, response: null }));
      const plan = developPlan({ posts: plain, previouslyLocked: ['a', 'b'], viewerId });
      expect([...plan.keys()]).toEqual(['a', 'b']);
    });
    it('clears all at once with Reduce Motion', () => {
      const plan = developPlan({
        posts,
        previouslyLocked: ['a', 'b'],
        viewerId,
        reduceMotion: true,
      });
      expect([...plan.values()]).toEqual([0, 0]);
    });
  });

  describe('developWords: the words on the first post to clear', () => {
    it('names the mate you answered', () => {
      expect(developWords({ posts: [mine, post('a', 'jo')], viewerId })).toBe(
        'You answered @sam. Here’s what your mates did.'
      );
    });
    it('says nothing when your newest post answered no tag', () => {
      expect(developWords({ posts: [post('a', 'jo')], viewerId })).toBeNull();
    });
  });
});
