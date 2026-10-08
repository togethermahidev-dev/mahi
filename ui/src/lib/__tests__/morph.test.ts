import { morphNumber, morphRect, validMorphSource } from '../morph';

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
