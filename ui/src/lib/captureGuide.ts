/**
 * The two-photo capture on the Camera screen: what the status line says, and what the small
 * photo-in-photo window on the live camera shows. Pure so it can be unit-tested; CameraScreen
 * reads these.
 */

export type CaptureState =
  'idle' | 'capturing-first' | 'switching' | 'awaiting-second' | 'capturing-second';

export type CameraSide = 'back' | 'front';

/**
 * The status line. `facing` is the camera showing now — after the switch, that's the side the
 * second photo comes from.
 */
export function captureLabel(
  state: CaptureState,
  facing: CameraSide,
  /** What a tap on the shutter makes (flag `video-posts`'s Photo / Video switch); photo by default. */
  mode: 'photo' | 'video' = 'photo'
): string | null {
  const video = mode === 'video';
  switch (state) {
    case 'idle':
      return null;
    case 'capturing-first':
    case 'capturing-second':
      return video ? 'Starting video…' : 'Taking photo…';
    case 'switching':
      return 'Switching…';
    case 'awaiting-second':
      if (video) return facing === 'front' ? 'Tap to film your selfie' : 'Tap to film your view';
      return facing === 'front' ? 'Tap for your selfie' : 'Tap for your view';
  }
}

/**
 * The short, persistent guide beside the shutter. It makes the two-shot flow readable before a
 * tap, without competing with the centre-screen status while a photo or camera switch is in
 * progress.
 */
export function captureStepLabel(state: CaptureState, facing: CameraSide): string | null {
  const subject = facing === 'front' ? 'Selfie' : 'Your view';
  if (state === 'idle') return `1 of 2 · ${subject}`;
  if (state === 'awaiting-second') return `2 of 2 · ${subject}`;
  return null;
}

export type PipGuide =
  | { kind: 'next'; next: 'selfie' | 'view'; text: 'Selfie next' | 'Your view next' }
  | { kind: 'photo' };

/** What the small window shows, or null when it's hidden. */
export function pipGuide(input: {
  state: CaptureState;
  facing: CameraSide;
  hasFirstPhoto: boolean;
  /** Posting isn't open (still loading, or no tag to answer). The window shows anyway (owner,
   *  2026-10-08: the camera always looks like the camera); only the shutter waits for a tag. */
  blocked?: boolean;
  cameraGranted: boolean;
}): PipGuide | null {
  const { state, facing, hasFirstPhoto, cameraGranted } = input;
  if (!cameraGranted) return null;

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
