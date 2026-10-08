/**
 * The locked feed's pixel athlete (owner, 2026-10-08): four exercises, two frames each, drawn on
 * one 9 × 10 grid, cycling runner → weightlifter → jumping jacks → push-ups.
 */
import { EXERCISES, GRID, athleteFrame } from '@/lib/pixelAthlete';

it('cycles through four exercises in order', () => {
  expect(EXERCISES.map((e) => e.name)).toEqual([
    'runner',
    'weightlifter',
    'jumping jacks',
    'push-ups',
  ]);
});

it('every frame fits the grid exactly', () => {
  for (const e of EXERCISES) {
    expect(e.frames).toHaveLength(2);
    for (const frame of e.frames) {
      expect(frame).toHaveLength(GRID.rows);
      for (const row of frame) expect(row).toHaveLength(GRID.cols);
      expect(frame.join('')).toMatch(/^[.#]+$/);
      expect(frame.join('')).toContain('#');
    }
  }
});

it('a tick picks the exercise, then the frame within it', () => {
  const beats = 6;
  expect(athleteFrame(0, beats)).toEqual({ exercise: 'runner', frame: 0 });
  expect(athleteFrame(1, beats)).toEqual({ exercise: 'runner', frame: 1 });
  expect(athleteFrame(6, beats)).toEqual({ exercise: 'weightlifter', frame: 0 });
  expect(athleteFrame(13, beats)).toEqual({ exercise: 'jumping jacks', frame: 1 });
  expect(athleteFrame(18, beats)).toEqual({ exercise: 'push-ups', frame: 0 });
  expect(athleteFrame(24, beats)).toEqual({ exercise: 'runner', frame: 0 });
});
