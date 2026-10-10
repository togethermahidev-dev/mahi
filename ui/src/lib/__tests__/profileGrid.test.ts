import { gridEndLine, gridInset, gridSquare, gridTileHeight, ownNextStep } from '../profileGrid';
import { PROFILE, SPACE } from '@/constants/tokens';

// A profile's posts: three squares across, edge to edge, with the small gap between them only
// (owner, 2026-10-10: "3x photos grid view is better on profiles grid rather than two").
describe('the profile grid', () => {
  it('is three across with the small gap', () => {
    expect(PROFILE.gridColumns).toBe(3);
    expect(PROFILE.gridGap).toBe(SPACE.s1);
  });

  it.each([375, 390, 393, 402, 430, 440])('fills a %i-wide screen edge to edge', (width) => {
    const square = gridSquare(width, 3, 1);
    // Three squares and the two gaps between them are the whole width: nothing at the edges.
    expect(square * 3 + 1 * 2).toBeCloseTo(width, 6);
  });

  it('starts the first square at the left edge and ends the last at the right edge', () => {
    const width = 393;
    const column = width / 3; // the list gives each column a third of the row
    const square = gridSquare(width, 3, 1);
    expect(gridInset(0, 3, 1)).toBe(0);
    expect(2 * column + gridInset(2, 3, 1) + square).toBeCloseTo(width, 6);
  });

  it('keeps exactly the gap between neighbours', () => {
    const width = 393;
    const column = width / 3;
    const square = gridSquare(width, 3, 1);
    const left = (i: number) => (i % 3) * column + gridInset(i, 3, 1);
    expect(left(1) - (left(0) + square)).toBeCloseTo(1, 6);
    expect(left(2) - (left(1) + square)).toBeCloseTo(1, 6);
  });

  it('places a post by its column, row after row', () => {
    expect(gridInset(3, 3, 1)).toBe(gridInset(0, 3, 1));
    expect(gridInset(4, 3, 1)).toBe(gridInset(1, 3, 1));
    expect(gridInset(8, 3, 1)).toBe(gridInset(2, 3, 1));
  });

  it('never makes a square wider than its column', () => {
    for (const i of [0, 1, 2]) {
      expect(gridInset(i, 3, 1) + gridSquare(393, 3, 1)).toBeLessThanOrEqual(393 / 3 + 1e-9);
    }
  });

  it('is a plain full-width square with one column', () => {
    expect(gridSquare(393, 1, 1)).toBe(393);
    expect(gridInset(5, 1, 1)).toBe(0);
  });
});

// Owner, 2026-10-10: "Make the profile grids slightly longer then square please".
describe('a grid tile', () => {
  it('is a little taller than it is wide: four wide to five tall', () => {
    expect(PROFILE.gridTileTall).toBe(1.25);
    expect(gridTileHeight(130, PROFILE.gridTileTall)).toBeCloseTo(162.5, 6);
  });

  it('is taller than a square, and never as tall as a full portrait photo', () => {
    const wide = gridSquare(393, 3, 1);
    const tall = gridTileHeight(wide, PROFILE.gridTileTall);
    expect(tall).toBeGreaterThan(wide);
    expect(tall).toBeLessThan(wide * (4 / 3));
  });
});

// Owner, 2026-10-10: a profile with a few posts "just looks blank"; say that the grid has ended.
describe('the line under the last post', () => {
  const done = { count: 3, hasMore: false, loading: false };

  it('on your own profile says that is all', () => {
    expect(gridEndLine({ ...done, isSelf: true, username: 'joe' })).toBe(
      'That’s all your workouts so far.'
    );
  });

  it('on someone else’s says that is all of theirs', () => {
    expect(gridEndLine({ ...done, isSelf: false, username: 'sam' })).toBe(
      'That’s all of @sam’s workouts so far.'
    );
    expect(gridEndLine({ ...done, isSelf: false, username: null })).toBe(
      'That’s all their workouts so far.'
    );
  });

  it('waits until the grid really has ended', () => {
    expect(gridEndLine({ ...done, isSelf: true, username: 'joe', hasMore: true })).toBeNull();
    expect(gridEndLine({ ...done, isSelf: true, username: 'joe', loading: true })).toBeNull();
  });

  it('leaves an empty grid to its own empty state', () => {
    expect(gridEndLine({ ...done, isSelf: true, username: 'joe', count: 0 })).toBeNull();
  });
});

// Owner, 2026-10-10: "Don't say the next one lands here have an action that takes them to
// someone depending what they need to do." Under your own grid: your next step in the loop.
describe('your next step, under your own grid', () => {
  it('tagged: says who, and takes you to the camera to post', () => {
    expect(ownNextStep({ tagsLoaded: true, taggers: ['sam'] })).toEqual({
      line: '@sam tagged you.',
      button: 'Post your Mahi',
      go: 'camera',
    });
    expect(ownNextStep({ tagsLoaded: true, taggers: ['sam', 'alex'] })?.line).toBe(
      '@sam and @alex tagged you.'
    );
  });

  it('not tagged: you post when a friend tags you, so it offers to invite one', () => {
    expect(ownNextStep({ tagsLoaded: true, taggers: [] })).toEqual({
      line: 'You post when a friend tags you.',
      button: 'Invite a friend',
      go: 'invite',
    });
  });

  it('offers nothing until the tags have been read: never a guess', () => {
    expect(ownNextStep({ tagsLoaded: false, taggers: [] })).toBeNull();
  });
});
