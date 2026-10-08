/**
 * The roadmap behind the waiting camera never tells someone who has posted to post their first
 * workout (owner, 2026-10-08), and shows nothing until it knows which they are.
 */
import { roadmap } from '@/lib/workoutRoadmap';

const titles = (r: ReturnType<typeof roadmap>) => r?.steps.map(([title]) => title);

it('shows nothing while it is not known whether you have posted', () => {
  expect(roadmap({ firstWorkoutDone: null, tagged: false, captured: false })).toBeNull();
});

it('before a first post: four steps, the first one current', () => {
  const r = roadmap({ firstWorkoutDone: false, tagged: false, captured: false });
  expect(titles(r)?.[0]).toBe('Show up once');
  expect(r?.steps).toHaveLength(4);
  expect(r?.current).toBe(0);
});

it('after a first post: no first-workout step at all', () => {
  const r = roadmap({ firstWorkoutDone: true, tagged: false, captured: false });
  expect(titles(r)).not.toContain('Show up once');
  expect(r?.steps).toHaveLength(3);
  expect(titles(r)?.[r!.current]).toBe('Wait for a tag');
});

it('tagged: answer is current; captured: holding 3 friends accountable is current', () => {
  const tagged = roadmap({ firstWorkoutDone: true, tagged: true, captured: false });
  expect(titles(tagged)?.[tagged!.current]).toBe('Answer with live proof of your workout');
  const captured = roadmap({ firstWorkoutDone: true, tagged: true, captured: true });
  expect(titles(captured)?.[captured!.current]).toBe('Hold 3 friends accountable');
});
