/**
 * A tiny pixel person doing jumping jacks (owner, 2026-10-08: "something cool" on the locked
 * feed's button). Two pixel frames drawn in the app and swapped on a timer: no image files, no
 * native code. Still on the first frame with Reduce Motion. Decorative: VoiceOver skips it.
 */
import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { MOTION } from '@/constants/tokens';

// 9 wide × 10 tall. '#' is a pixel.
const FRAMES = [
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
] as const;
/** One pixel on the grid; the Svg's viewBox is in pixels, so a pixel is one unit. */
const PIXEL = 1;
const COLS = FRAMES[0][0].length;
const ROWS = FRAMES[0].length;

export default function PixelAthlete({
  size,
  color,
}: {
  /** Height in points; the width follows the pixel grid. */
  size: number;
  color: string;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), MOTION.pixelFrameMs);
    return () => clearInterval(id);
  }, [reduceMotion]);
  const pixels = FRAMES[frame];
  return (
    <Svg
      width={(size * COLS) / ROWS}
      height={size}
      viewBox={`0 0 ${COLS} ${ROWS}`}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {pixels.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === '#' ? (
            <Rect key={`${x}-${y}`} x={x} y={y} width={PIXEL} height={PIXEL} fill={color} />
          ) : null
        )
      )}
    </Svg>
  );
}
