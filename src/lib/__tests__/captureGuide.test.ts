import { captureLabel, pipGuide, previewPipRestTop, type CaptureState } from '../captureGuide';

describe('captureLabel — the status line while taking the two photos', () => {
  describe('guide on: short, plain, sentence case', () => {
    it('says it is taking the photo, for both photos', () => {
      expect(captureLabel('capturing-first', 'back', true)).toBe('Taking photo…');
      expect(captureLabel('capturing-second', 'front', true)).toBe('Taking photo…');
    });

    it('says it is switching camera after the first photo', () => {
      expect(captureLabel('switching', 'front', true)).toBe('Switching…');
    });

    it('asks for the selfie when the front camera is up second', () => {
      expect(captureLabel('awaiting-second', 'front', true)).toBe('Tap for your selfie');
    });

    it('asks for your view when the back camera is up second', () => {
      expect(captureLabel('awaiting-second', 'back', true)).toBe('Tap for your view');
    });

    it('says nothing before the first tap', () => {
      expect(captureLabel('idle', 'back', true)).toBeNull();
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
          const label = captureLabel(state, side, true);
          expect(label).not.toBeNull();
          expect(label).not.toBe(label!.toUpperCase());
        }
      }
    });
  });

  describe('guide off: exactly the labels from before', () => {
    it('keeps the old wording', () => {
      expect(captureLabel('idle', 'back', false)).toBeNull();
      expect(captureLabel('capturing-first', 'back', false)).toBe('CAPTURING...');
      expect(captureLabel('switching', 'front', false)).toBe('SWITCHING...');
      expect(captureLabel('awaiting-second', 'front', false)).toBe('TAP FOR SELFIE');
      expect(captureLabel('awaiting-second', 'back', false)).toBe('TAP FOR POV');
      expect(captureLabel('capturing-second', 'front', false)).toBe('CAPTURING...');
    });
  });
});

describe('pipGuide — what the small window on the live camera shows', () => {
  const base = {
    guideOn: true,
    state: 'idle' as CaptureState,
    facing: 'back' as const,
    hasFirstPhoto: false,
    hasPostedToday: false,
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

  it('is hidden once today’s photo is posted', () => {
    expect(pipGuide({ ...base, hasPostedToday: true })).toBeNull();
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
