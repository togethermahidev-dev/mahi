import { circleFeedback, mateCircles, mateCirclesTitle, type CircleMate } from '../mateCircles';

const sam: CircleMate = { user_id: 'u-sam', username: 'sam', avatar_url: 'https://x/sam.jpg' };
const ali: CircleMate = { user_id: 'u-ali', username: 'ali', avatar_url: null };
const kim: CircleMate = { user_id: 'u-kim', username: 'kim', avatar_url: null };

describe('mateCircles: one circle per mate the post needs', () => {
  it('starts as empty circles, one per required mate', () => {
    const circles = mateCircles({ total: 3, friends: [], links: 0 });
    expect(circles.map((c) => c.kind)).toEqual(['empty', 'empty', 'empty']);
    expect(circles.map((c) => c.a11y)).toEqual([
      'Mate 1 of 3, empty',
      'Mate 2 of 3, empty',
      'Mate 3 of 3, empty',
    ]);
  });

  it('fills friends first, in the order they were tagged, then links', () => {
    const circles = mateCircles({ total: 3, friends: [sam, ali], links: 1 });
    expect(circles).toEqual([
      {
        kind: 'friend',
        index: 0,
        key: 'u-sam',
        userId: 'u-sam',
        avatarUrl: 'https://x/sam.jpg',
        initial: 'S',
        caption: '@sam',
        a11y: 'Mate 1 of 3, @sam',
      },
      {
        kind: 'friend',
        index: 1,
        key: 'u-ali',
        userId: 'u-ali',
        avatarUrl: null,
        initial: 'A',
        caption: '@ali',
        a11y: 'Mate 2 of 3, @ali',
      },
      {
        kind: 'link',
        index: 2,
        key: 'link-1',
        link: 1,
        caption: 'Link 1',
        a11y: 'Mate 3 of 3, Link 1',
      },
    ]);
  });

  it('numbers links among themselves', () => {
    const circles = mateCircles({ total: 3, friends: [], links: 2 });
    expect(circles.map((c) => c.caption)).toEqual(['Link 1', 'Link 2', '']);
  });

  it('never shows more circles than the post needs', () => {
    expect(mateCircles({ total: 3, friends: [sam, ali, kim], links: 2 })).toHaveLength(3);
    expect(mateCircles({ total: 0, friends: [], links: 0 })).toEqual([]);
  });

  it('a name with nothing to draw shows a question mark', () => {
    expect(
      mateCircles({ total: 1, friends: [{ ...sam, username: '' }], links: 0 })[0]
    ).toMatchObject({ initial: '?' });
  });
});

describe('mateCirclesTitle', () => {
  it('asks for the mates until every circle is filled', () => {
    expect(mateCirclesTitle({ total: 3, friends: [], links: 0 })).toBe(
      'Pick 3 mates to keep you going'
    );
    expect(mateCirclesTitle({ total: 3, friends: [sam, ali], links: 0 })).toBe(
      'Pick 3 mates to keep you going'
    );
    expect(mateCirclesTitle({ total: 1, friends: [], links: 0 })).toBe(
      'Pick a mate to keep you going'
    );
  });

  it('names the friends once they are all picked', () => {
    expect(mateCirclesTitle({ total: 3, friends: [sam, ali, kim], links: 0 })).toBe(
      '@sam, @ali and @kim will keep you going'
    );
    expect(mateCirclesTitle({ total: 2, friends: [sam, ali], links: 0 })).toBe(
      '@sam and @ali will keep you going'
    );
    expect(mateCirclesTitle({ total: 1, friends: [sam], links: 0 })).toBe(
      '@sam will keep you going'
    );
  });

  it('links only: your mates', () => {
    expect(mateCirclesTitle({ total: 3, friends: [], links: 3 })).toBe(
      'Your 3 mates will keep you going'
    );
    expect(mateCirclesTitle({ total: 1, friends: [], links: 1 })).toBe(
      'Your mate will keep you going'
    );
  });

  it('friends and links: names the friends, counts the invited mates', () => {
    expect(mateCirclesTitle({ total: 3, friends: [sam], links: 2 })).toBe(
      '@sam and 2 invited mates will keep you going'
    );
    expect(mateCirclesTitle({ total: 3, friends: [sam, ali], links: 1 })).toBe(
      '@sam, @ali and 1 invited mate will keep you going'
    );
  });
});

describe('circleFeedback: what a change to the circles feels like', () => {
  const at = (friends: CircleMate[], links: number) => mateCircles({ total: 3, friends, links });

  it('a circle filling is a light selection, and says which', () => {
    expect(circleFeedback(at([], 0), at([sam], 0))).toEqual({
      haptic: 'selection',
      filled: [{ kind: 'friend', index: 0 }],
      full: false,
    });
    expect(circleFeedback(at([sam], 0), at([sam], 1))).toEqual({
      haptic: 'selection',
      filled: [{ kind: 'link', index: 1 }],
      full: false,
    });
  });

  it('the last circle filling is a tick, and the row is full', () => {
    expect(circleFeedback(at([sam, ali], 0), at([sam, ali], 1))).toEqual({
      haptic: 'tick',
      filled: [{ kind: 'link', index: 2 }],
      full: true,
    });
  });

  it('removing one, or nothing changing, is felt as nothing', () => {
    expect(circleFeedback(at([sam, ali], 1), at([sam], 1))).toEqual({
      haptic: null,
      filled: [],
      full: false,
    });
    expect(circleFeedback(at([sam], 0), at([sam], 0)).haptic).toBeNull();
  });

  it('a friend moving to another circle after a removal is not a new fill', () => {
    // sam removed: ali slides from circle 2 to circle 1.
    expect(circleFeedback(at([sam, ali], 0), at([ali], 0)).filled).toEqual([]);
  });

  it('the circles appearing already filled (a sheet reopened) are not felt', () => {
    expect(circleFeedback(null, at([sam, ali], 1))).toEqual({
      haptic: null,
      filled: [],
      full: true,
    });
  });
});
