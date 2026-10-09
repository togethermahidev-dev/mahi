/**
 * The roadmap behind the waiting camera never tells someone who has posted to post their first
 * workout (owner, 2026-10-08), and shows nothing until it knows which they are.
 */
import { roadmap, stepAction } from '@/lib/workoutRoadmap';

const titles = (r: ReturnType<typeof roadmap>) => r?.steps.map(([title]) => title);

it('shows nothing while it is not known whether you have posted', () => {
  expect(roadmap({ firstWorkoutDone: null, tagged: false, captured: false })).toBeNull();
});

// Core workflow (2026-10-09): the first post tags 1 mate; answers tag 3.
it("the steps in the core workflow's words", () => {
  const r = roadmap({ firstWorkoutDone: false, tagged: false, captured: false });
  expect(r?.steps[0]).toEqual(['Show up and tag a mate', 'Post any workout and tag 1 mate.']);
  expect(titles(r)).toEqual([
    'Show up and tag a mate',
    'Wait for a tag',
    'Answer with live proof of your workout',
    'Hold 3 friends accountable',
  ]);
});

it('before a first post: four steps, the first one current', () => {
  const r = roadmap({ firstWorkoutDone: false, tagged: false, captured: false });
  expect(titles(r)?.[0]).toBe('Show up and tag a mate');
  expect(r?.steps).toHaveLength(4);
  expect(r?.current).toBe(0);
});

it('after a first post: no first-workout step at all', () => {
  const r = roadmap({ firstWorkoutDone: true, tagged: false, captured: false });
  expect(titles(r)).not.toContain('Show up and tag a mate');
  expect(r?.steps).toHaveLength(3);
  expect(titles(r)?.[r!.current]).toBe('Wait for a tag');
});

it('tagged: answer is current; captured: holding 3 friends accountable is current', () => {
  const tagged = roadmap({ firstWorkoutDone: true, tagged: true, captured: false });
  expect(titles(tagged)?.[tagged!.current]).toBe('Answer with live proof of your workout');
  const captured = roadmap({ firstWorkoutDone: true, tagged: true, captured: true });
  expect(titles(captured)?.[captured!.current]).toBe('Hold 3 friends accountable');
});

// Owner, 2026-10-08: each circle does its step's job — post goes back to the camera, waiting for
// a tag goes to finding friends. A step already done, or one that can't happen yet, says why.
describe('stepAction — what tapping a step’s circle does', () => {
  const first = { firstWorkoutDone: false, tagged: false, captured: false };
  const waiting = { firstWorkoutDone: true, tagged: false, captured: false };
  const tagged = { firstWorkoutDone: true, tagged: true, captured: false };
  it('the current step does its job', () => {
    expect(stepAction(first, 0)).toEqual({ kind: 'camera' });
    expect(stepAction(waiting, 0)).toEqual({ kind: 'friends' });
    expect(stepAction(tagged, 1)).toEqual({ kind: 'camera' });
  });
  it('waiting for a tag can always find friends', () => {
    expect(stepAction(tagged, 0)).toEqual({ kind: 'friends' });
  });
  it('a later step says what has to come first', () => {
    expect(stepAction(waiting, 1)).toEqual({ kind: 'later', first: 'Wait for a tag' });
    expect(stepAction(first, 2)).toEqual({ kind: 'later', first: 'Show up and tag a mate' });
  });
  it('a step already done does nothing', () => {
    expect(stepAction({ ...tagged, captured: true }, 1)).toEqual({ kind: 'done' });
  });
});
