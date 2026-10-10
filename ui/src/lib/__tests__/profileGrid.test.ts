import { gridInset, gridSquare } from '../profileGrid';
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
