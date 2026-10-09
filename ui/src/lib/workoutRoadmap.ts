/**
 * The roadmap behind the waiting camera: which steps show and which is current. Pure, unit-tested;
 * the view is src/components/WorkoutRoadmap.tsx.
 *
 * Someone who has posted never sees "post your first workout" (owner, 2026-10-08): the step is
 * dropped. Nothing shows until the server has said whether you have posted (never a guess that
 * then changes).
 */
// Short and direct under each circle (owner, 2026-10-08). The first post tags 1 mate; answers
// tag 3 (core workflow, 2026-10-09).
export const ROADMAP_STEPS: readonly (readonly [title: string, body: string])[] = [
  ['Show up and tag a mate', 'Post any workout and tag 1 mate.'],
  ['Wait for a tag', 'A friend’s tag unlocks your next post.'],
  ['Answer with live proof of your workout', 'Photo and selfie before time’s up.'],
  ['Hold 3 friends accountable', 'Tag 3 friends to go next.'],
];

export function roadmap({
  firstWorkoutDone,
  tagged,
  captured,
}: {
  /** null while the server hasn't said. */
  firstWorkoutDone: boolean | null;
  tagged: boolean;
  captured: boolean;
}): { steps: readonly (readonly [string, string])[]; current: number } | null {
  if (firstWorkoutDone === null) return null;
  if (!firstWorkoutDone) return { steps: ROADMAP_STEPS, current: 0 };
  return { steps: ROADMAP_STEPS.slice(1), current: !tagged ? 0 : captured ? 2 : 1 };
}

/** What tapping a step's circle does. */
export type StepAction =
  { kind: 'camera' } | { kind: 'friends' } | { kind: 'later'; first: string } | { kind: 'done' };

/**
 * A step's circle does that step's job (owner, 2026-10-08): posting steps go back to the camera,
 * waiting for a tag goes to finding friends (more friends, more tags). A step already done does
 * nothing; a later one says which step comes first. `index` is the step's place in `roadmap()`.
 */
export function stepAction(
  input: { firstWorkoutDone: boolean | null; tagged: boolean; captured: boolean },
  index: number
): StepAction {
  const map = roadmap(input);
  if (!map) return { kind: 'done' };
  const title = map.steps[index]?.[0];
  if (title === 'Wait for a tag') return { kind: 'friends' };
  if (index < map.current) return { kind: 'done' };
  if (index > map.current) return { kind: 'later', first: map.steps[map.current][0] };
  return { kind: 'camera' };
}
