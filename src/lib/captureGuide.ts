/**
 * The two-photo capture on the Camera screen: what the status line says, and what the small
 * photo-in-photo window on the live camera shows. Pure so it can be unit-tested; CameraScreen
 * reads these. `guideOn` is the `camera-pip-guide` flag — off keeps the old labels and no window.
 */

export type CaptureState =
  | 'idle'
  | 'capturing-first'
  | 'switching'
  | 'awaiting-second'
  | 'capturing-second';

export type CameraSide = 'back' | 'front';

/**
 * The status line. `facing` is the camera showing now — after the switch, that's the side the
 * second photo comes from.
 */
export function captureLabel(
  state: CaptureState,
  facing: CameraSide,
  guideOn: boolean
): string | null {
  switch (state) {
    case 'idle':
      return null;
    case 'capturing-first':
    case 'capturing-second':
      return guideOn ? 'Taking photo…' : 'CAPTURING...';
    case 'switching':
      return guideOn ? 'Switching…' : 'SWITCHING...';
    case 'awaiting-second':
      if (guideOn) return facing === 'front' ? 'Tap for your selfie' : 'Tap for your view';
      return `TAP FOR ${facing === 'back' ? 'POV' : 'SELFIE'}`;
  }
}

export type PipGuide =
  | { kind: 'next'; next: 'selfie' | 'view'; text: 'Selfie next' | 'Your view next' }
  | { kind: 'photo' };

/** What the small window shows, or null when it's hidden. */
export function pipGuide(input: {
  guideOn: boolean;
  state: CaptureState;
  facing: CameraSide;
  hasFirstPhoto: boolean;
  /** Posting isn't open (still loading, or no tag to answer). */
  blocked: boolean;
  cameraGranted: boolean;
}): PipGuide | null {
  const { guideOn, state, facing, hasFirstPhoto, blocked, cameraGranted } = input;
  if (!guideOn || blocked || !cameraGranted) return null;

  const beforeFirst = state === 'idle' || state === 'capturing-first';
  if (!beforeFirst && hasFirstPhoto) return { kind: 'photo' };

  // Before the first photo the second comes from the other side; after the switch, from this one.
  const secondSide: CameraSide = beforeFirst ? (facing === 'back' ? 'front' : 'back') : facing;
  return secondSide === 'front'
    ? { kind: 'next', next: 'selfie', text: 'Selfie next' }
    : { kind: 'next', next: 'view', text: 'Your view next' };
}

/**
 * Where the preview's photo-in-photo rests (its top edge), bottom-left: from the bottom of the
 * screen, a 32 gap, POST (64), a 12 gap, the tag/caption pill row (36), then 12 above that.
 * The live camera's window sits in the same spot.
 */
export function previewPipRestTop(screenHeight: number, pipHeight: number): number {
  const pillsTop = screenHeight - 32 - 64 - 12 - 36;
  return pillsTop - pipHeight - 12;
}
