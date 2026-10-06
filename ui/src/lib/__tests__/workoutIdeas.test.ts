import { WORKOUT_IDEAS, WORKOUT_SAFETY_LINE, workoutIdeas } from '../workoutIdeas';

describe('workoutIdeas — "Need an idea?" on the caption sheet', () => {
  it('has the nine ideas, from a pram walk to chair exercises and physio', () => {
    expect(WORKOUT_IDEAS).toHaveLength(9);
    const all = WORKOUT_IDEAS.join(' ').toLowerCase();
    for (const word of [
      'pram',
      'chair',
      'stretch',
      'physio',
      'stairs',
      'run',
      'class',
      'danc',
      'yoga',
    ]) {
      expect(all).toContain(word);
    }
  });

  it('leads with a different idea each day of the week, and always lists all nine', () => {
    const firsts = [0, 1, 2, 3, 4, 5, 6].map((day) => workoutIdeas(day)[0]);
    expect(new Set(firsts).size).toBe(7);
    for (const day of [0, 3, 6]) {
      expect([...workoutIdeas(day)].sort()).toEqual([...WORKOUT_IDEAS].sort());
    }
  });

  it('is the same list for the same day (no randomness, nothing saved)', () => {
    expect(workoutIdeas(2)).toEqual(workoutIdeas(2));
  });

  it('takes the weekday from a date', () => {
    // 2026-10-05 is a Monday (1).
    expect(workoutIdeas(new Date(2026, 9, 5))).toEqual(workoutIdeas(1));
  });

  it('ends with a safety line about pain and heat', () => {
    expect(WORKOUT_SAFETY_LINE).toBe(
      'If something hurts, stop. In the heat, go early or late and drink water.'
    );
  });

  it('sentence case, no full stops, no emoji', () => {
    for (const idea of WORKOUT_IDEAS) {
      expect(idea[0]).toBe(idea[0].toUpperCase());
      expect(idea).not.toMatch(/\.$/);
      expect(idea).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
