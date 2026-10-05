import { captureLabel, pipGuide, previewPipRestTop, type CaptureState } from '../captureGuide';

describe('captureLabel — the status line while taking the two photos', () => {
  it('says it is taking the photo, for both photos', () => {
    expect(captureLabel('capturing-first', 'back')).toBe('Taking photo…');
    expect(captureLabel('capturing-second', 'front')).toBe('Taking photo…');
  });

  it('says it is switching camera after the first photo', () => {
    expect(captureLabel('switching', 'front')).toBe('Switching…');
  });

  it('asks for the selfie when the front camera is up second', () => {
    expect(captureLabel('awaiting-second', 'front')).toBe('Tap for your selfie');
  });

  it('asks for your view when the back camera is up second', () => {
    expect(captureLabel('awaiting-second', 'back')).toBe('Tap for your view');
  });

  it('in Video mode, asks you to film the second shot', () => {
    expect(captureLabel('awaiting-second', 'front', 'video')).toBe('Tap to film your selfie');
    expect(captureLabel('awaiting-second', 'back', 'video')).toBe('Tap to film your view');
  });

  it('in Video mode, says it is starting the video rather than taking a photo', () => {
    expect(captureLabel('capturing-first', 'back', 'video')).toBe('Starting video…');
  });

  it('Photo mode reads as before', () => {
    expect(captureLabel('awaiting-second', 'front', 'photo')).toBe('Tap for your selfie');
  });

  it('says nothing before the first tap', () => {
    expect(captureLabel('idle', 'back')).toBeNull();
  });

  it('never shows an all-caps label', () => {
    const states: CaptureState[] = [
      'capturing-first',
      'switching',
      'awaiting-second',
      'capturing-second',
    ];
    for (const state of states) {
      for (const side of ['back', 'front'] as const) {
        const label = captureLabel(state, side);
        expect(label).not.toBeNull();
        expect(label).not.toBe(label!.toUpperCase());
      }
    }
  });
});

describe('pipGuide — what the small window on the live camera shows', () => {
  const base = {
    guideOn: true,
    state: 'idle' as CaptureState,
    facing: 'back' as const,
    hasFirstPhoto: false,
    blocked: false,
    cameraGranted: true,
  };

  it('before the first photo on the back camera, says the selfie comes next', () => {
    expect(pipGuide(base)).toEqual({ kind: 'next', next: 'selfie', text: 'Selfie next' });
  });

  it('before the first photo on the front camera, says your view comes next', () => {
    expect(pipGuide({ ...base, facing: 'front' })).toEqual({
      kind: 'next',
      next: 'view',
      text: 'Your view next',
    });
  });

  it('keeps saying what comes next while the first photo is being taken', () => {
    expect(pipGuide({ ...base, state: 'capturing-first' })).toEqual({
      kind: 'next',
      next: 'selfie',
      text: 'Selfie next',
    });
  });

  it('shows the first photo from the switch until the second photo is taken', () => {
    for (const state of ['switching', 'awaiting-second', 'capturing-second'] as const) {
      expect(pipGuide({ ...base, state, facing: 'front', hasFirstPhoto: true })).toEqual({
        kind: 'photo',
      });
    }
  });

  it('without a first photo after the switch, still says what is being taken second', () => {
    expect(pipGuide({ ...base, state: 'awaiting-second', facing: 'front' })).toEqual({
      kind: 'next',
      next: 'selfie',
      text: 'Selfie next',
    });
  });

  it('is hidden while posting is blocked', () => {
    expect(pipGuide({ ...base, blocked: true })).toBeNull();
  });

  it('is hidden without camera permission', () => {
    expect(pipGuide({ ...base, cameraGranted: false })).toBeNull();
  });

  it('is hidden when the flag is off', () => {
    expect(pipGuide({ ...base, guideOn: false })).toBeNull();
    expect(
      pipGuide({ ...base, guideOn: false, state: 'awaiting-second', hasFirstPhoto: true })
    ).toBeNull();
  });
});

describe('previewPipRestTop — where the preview photo-in-photo rests', () => {
  it('sits 12 above the tag/caption pills, which sit 12 above the 64-tall POST, 32 from the bottom', () => {
    // 32 + 64 + 12 + 36 (pill row) + 12 = 156 from the bottom, then the window's height.
    expect(previewPipRestTop(800, 170)).toBe(800 - 156 - 170);
    expect(previewPipRestTop(932, 100)).toBe(932 - 156 - 100);
  });
});
