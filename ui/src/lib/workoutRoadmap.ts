/**
 * The roadmap behind the waiting camera: which steps show and which is current. Pure, unit-tested;
 * the view is src/components/WorkoutRoadmap.tsx.
 *
 * Someone who has posted never sees "post your first workout" (owner, 2026-10-08): the step is
 * dropped. Nothing shows until the server has said whether you have posted (never a guess that
 * then changes).
 */
export const ROADMAP_STEPS: readonly (readonly [title: string, body: string])[] = [
  ['Show up once', 'Post your first workout. No tag needed.'],
  ['Wait for a tag', 'A friend’s tag lets you post your next workout.'],
  [
    'Answer with live proof of your workout',
    'Capture your workout and a selfie before the tag expires.',
  ],
  ['Hold 3 friends accountable', 'Tag 3 friends you want to see show up next.'],
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
