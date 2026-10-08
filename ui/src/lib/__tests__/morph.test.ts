import { morphNumber, morphRect, pageMorphFrame, validMorphSource } from '../morph';

describe('morph geometry', () => {
  const from = { x: 20, y: 100, width: 160, height: 160 };
  const to = { x: 0, y: 0, width: 390, height: 844 };

  it('starts at the tapped element and ends at the destination', () => {
    expect(morphRect(from, to, 0)).toEqual(from);
    expect(morphRect(from, to, 1)).toEqual(to);
  });

  it('interpolates every edge and clamps progress', () => {
    expect(morphRect(from, to, 0.5)).toEqual({ x: 10, y: 50, width: 275, height: 502 });
    expect(morphNumber(10, 20, -1)).toBe(10);
    expect(morphNumber(10, 20, 2)).toBe(20);
  });

  it('only accepts a visible source with an image', () => {
    expect(validMorphSource({ ...from, uri: 'photo', borderRadius: 12 })).toBe(true);
    expect(validMorphSource({ ...from, uri: '', borderRadius: 12 })).toBe(false);
    expect(validMorphSource({ ...from, width: 0, uri: 'photo', borderRadius: 12 })).toBe(false);
    expect(validMorphSource(null)).toBe(false);
  });
});

// Owner, 2026-10-08: tapping a tab (or a button that opens a page) grows the new page in place,
// Netflix-style, from the same shared morph value; a swipe still slides.
describe('pageMorphFrame — a page growing in from a tap', () => {
  it('starts small, rounded and clear-through; ends full size, square and solid', () => {
    expect(pageMorphFrame(0)).toEqual({ opacity: 0, scale: 0.94, borderRadius: 28 });
    expect(pageMorphFrame(1)).toEqual({ opacity: 1, scale: 1, borderRadius: 0 });
  });

  it('is already fully in by the point the shared morph joins its content', () => {
    expect(pageMorphFrame(0.72).opacity).toBe(1);
    expect(pageMorphFrame(0.36).opacity).toBe(0.5);
  });

  it('clamps progress', () => {
    expect(pageMorphFrame(-1)).toEqual(pageMorphFrame(0));
    expect(pageMorphFrame(2)).toEqual(pageMorphFrame(1));
  });
});
