import { POINTS_RULE, pointsHint } from '../pointsHint';

describe('the line under your Points · Best', () => {
  // Usability walkthrough 2026-10-07: one rule everywhere — the first post earns the first point.
  it('a newcomer at 0 · 0 is told how points are earned', () => {
    expect(pointsHint(0, 0)).toBe(
      'Your first workout earns 1 point. Each answer to a friend’s tag earns 1 more.'
    );
    expect(pointsHint(null, null)).toBe(
      'Your first workout earns 1 point. Each answer to a friend’s tag earns 1 more.'
    );
  });

  it('the whole rule, as the profile explains it', () => {
    expect(POINTS_RULE).toBe(
      'Your first workout earns 1 point. Each answer to a friend’s tag earns 1 more. Miss one and your points go back to 0 — your best stays.'
    );
  });

  // Design round 5 (gap 6): after a miss, "0 · Best 12" alone reads as a loss with no way back.
  it('after a miss: the best stays and the next answer starts you again', () => {
    expect(pointsHint(0, 12)).toBe(
      'Back to 0. Your best of 12 stays. Your next answer starts you again.'
    );
    expect(pointsHint(null, 1)).toBe(
      'Back to 0. Your best of 1 stays. Your next answer starts you again.'
    );
  });

  // Points only go back to 0 on a miss, so points under the best means they came back after one.
  it('climbing back after a miss: back at it, with the best to aim for', () => {
    expect(pointsHint(1, 12)).toBe('Back at it: your best is 12.');
    expect(pointsHint(11, 12)).toBe('Back at it: your best is 12.');
  });

  it('says nothing once you are at or past your best', () => {
    expect(pointsHint(12, 12)).toBeNull();
    expect(pointsHint(5, 5)).toBeNull();
  });

  it('never says streak and never shouts', () => {
    for (const [p, b] of [
      [0, 0],
      [0, 12],
      [3, 12],
    ]) {
      expect(pointsHint(p, b) ?? '').not.toMatch(/streak|!/i);
    }
  });
});
