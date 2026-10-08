/**
 * The locked feed's pixel athlete: four exercises, two frames each, on one 9 × 10 grid (owner,
 * 2026-10-08: a runner, a weightlifter and others, cycling). Pure, unit-tested; the drawing is
 * src/components/PixelAthlete.tsx. '#' is a pixel.
 */
export const GRID = { cols: 9, rows: 10 } as const;

export type Frame = readonly string[];

export const EXERCISES: readonly { name: string; frames: readonly [Frame, Frame] }[] = [
  {
    name: 'runner',
    frames: [
      [
        '....###..',
        '....###..',
        '.....#...',
        '.######..',
        '..#.#.#..',
        '...#.#...',
        '..#..#...',
        '.#....#..',
        '#......#.',
        '.......#.',
      ],
      [
        '....###..',
        '....###..',
        '.....#...',
        '..####...',
        '.#..#..#.',
        '....#....',
        '...#.#...',
        '..#...#..',
        '...#..#..',
        '..#....#.',
      ],
    ],
  },
  {
    name: 'weightlifter',
    frames: [
      [
        '.........',
        '....###..',
        '....###..',
        '#########',
        '#...#...#',
        '.#..#..#.',
        '..#.#.#..',
        '...###...',
        '...#.#...',
        '..##.##..',
      ],
      [
        '#########',
        '#.......#',
        '.#.###.#.',
        '.#.###.#.',
        '..#.#.#..',
        '...###...',
        '....#....',
        '...#.#...',
        '...#.#...',
        '..##.##..',
      ],
    ],
  },
  {
    name: 'jumping jacks',
    frames: [
      [
        '....###..',
        '....###..',
        '.....#...',
        '..#####..',
        '.#..#..#.',
        '....#....',
        '....#....',
        '...#.#...',
        '...#.#...',
        '..#...#..',
      ],
      [
        '#...###.#',
        '.#..###.#',
        '..#..#.#.',
        '...####..',
        '....#....',
        '....#....',
        '...#.#...',
        '..#...#..',
        '.#.....#.',
        '#.......#',
      ],
    ],
  },
  {
    name: 'push-ups',
    frames: [
      [
        '.........',
        '.........',
        '.........',
        '.........',
        '.........',
        '###.####.',
        '###....##',
        '.#......#',
        '.#......#',
        '.........',
      ],
      [
        '.........',
        '.........',
        '.........',
        '.........',
        '.........',
        '.........',
        '.........',
        '###.####.',
        '###....##',
        '##......#',
      ],
    ],
  },
];

/**
 * Which exercise and frame a beat shows: `beats` beats per exercise (frames alternate each beat),
 * then the next exercise, round and round.
 */
export function athleteFrame(tick: number, beats: number): { exercise: string; frame: number } {
  const exercise = EXERCISES[Math.floor(tick / beats) % EXERCISES.length];
  return { exercise: exercise.name, frame: tick % exercise.frames.length };
}
