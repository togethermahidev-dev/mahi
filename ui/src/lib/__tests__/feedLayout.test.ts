import { feedLayout, ringProgress } from '../feedLayout';

describe('feedLayout', () => {
  it('keeps today’s layout on a regular phone at regular text size', () => {
    expect(feedLayout({ width: 390, height: 844, fontScale: 1 })).toEqual({
      captionLines: 2,
      actionIcon: 32,
      shadeHeight: 0.5,
      actionsBottom: 0.4,
    });
  });

  it('gives a small phone smaller buttons set lower, so they clear the caption', () => {
    const small = feedLayout({ width: 375, height: 667, fontScale: 1 });
    expect(small.actionIcon).toBe(28);
    expect(small.actionsBottom).toBeLessThan(0.4);
  });

  it('lets a tall phone show a third caption line', () => {
    expect(feedLayout({ width: 430, height: 932, fontScale: 1 }).captionLines).toBe(3);
  });

  it('gives large text more caption lines and a taller shade', () => {
    const big = feedLayout({ width: 390, height: 844, fontScale: 1.5 });
    expect(big.captionLines).toBe(4);
    expect(big.shadeHeight).toBeGreaterThan(0.5);
  });
});

describe('ringProgress', () => {
  const DAY = 24 * 3600 * 1000;
  it('is full at the start of the window and empty at the end', () => {
    expect(ringProgress(DAY, DAY)).toBe(1);
    expect(ringProgress(0, DAY)).toBe(0);
    expect(ringProgress(DAY / 4, DAY)).toBe(0.25);
  });

  it('never goes below empty or past full', () => {
    expect(ringProgress(-5, DAY)).toBe(0);
    expect(ringProgress(2 * DAY, DAY)).toBe(1);
    expect(ringProgress(5, 0)).toBe(0);
  });
});
