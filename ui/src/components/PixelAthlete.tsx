/**
 * A tiny pixel athlete (owner, 2026-10-08: "something cool" on the locked feed's button): a
 * runner, a weightlifter, jumping jacks and push-ups, two frames each, cycling on a timer. Drawn
 * in the app: no image files, no native code. Still (the runner's first frame) with Reduce
 * Motion. Decorative: VoiceOver skips it. Frames and the cycle: src/lib/pixelAthlete.ts.
 */
import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { MOTION } from '@/constants/tokens';
import { EXERCISES, GRID, athleteFrame } from '@/lib/pixelAthlete';

/** One pixel on the grid; the Svg's viewBox is in pixels, so a pixel is one unit. */
const PIXEL = 1;

export default function PixelAthlete({
  size,
  color,
}: {
  /** Height in points; the width follows the pixel grid. */
  size: number;
  color: string;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setTick((t) => t + 1), MOTION.pixelFrameMs);
    return () => clearInterval(id);
  }, [reduceMotion]);
  const { exercise, frame } = athleteFrame(tick, MOTION.pixelBeatsPerExercise);
  const pixels = EXERCISES.find((e) => e.name === exercise)!.frames[frame];
  return (
    <Svg
      width={(size * GRID.cols) / GRID.rows}
      height={size}
      viewBox={`0 0 ${GRID.cols} ${GRID.rows}`}
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
