/**
 * "Need an idea?" on the caption sheet: what counts as a workout, for someone stuck for one
 * (round 5 fitness gap 2). A hint, not a feature, so no switch. The first idea changes with the
 * day of the week so a regular sees something new; nothing is random, saved or tracked.
 *
 * Pure and import-free so it runs under the node-only jest harness.
 */

export const WORKOUT_IDEAS: readonly string[] = [
  'A brisk 20-minute walk, with the pram or the dog',
  'Chair exercises: seated marches and arm circles',
  '10 minutes of stretching',
  'Your physio exercises',
  'Stairs: up and down 5 times',
  'A run or a jog, at your own pace',
  'A class: spin, circuits, swimming or anything you like',
  'Dancing in the kitchen',
  'Yoga at home or in a class',
];

/** The sheet's last line. */
export const WORKOUT_SAFETY_LINE =
  'If something hurts, stop. In the heat, go early or late and drink water.';

/** Every idea, starting from the one for this weekday (0 = Sunday, as `Date#getDay`). */
export function workoutIdeas(day: number | Date = new Date()): string[] {
  const weekday = typeof day === 'number' ? day : day.getDay();
  const start = ((weekday % WORKOUT_IDEAS.length) + WORKOUT_IDEAS.length) % WORKOUT_IDEAS.length;
  return [...WORKOUT_IDEAS.slice(start), ...WORKOUT_IDEAS.slice(0, start)];
}
