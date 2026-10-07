import {
  PHOTO_CAPTURE,
  flashMode,
  flashValueLabel,
  focusPoint,
  focusSquareOrigin,
  nextFlash,
  shutterSoundPlan,
  tapFocusAvailable,
  type FlashChoice,
} from '../cameraCapture';

describe('flash — off, on, auto, round again', () => {
  it('cycles off → on → auto → off', () => {
    expect(nextFlash('off')).toBe('on');
    expect(nextFlash('on')).toBe('auto');
    expect(nextFlash('auto')).toBe('off');
  });

  it('the back camera uses the flash as chosen', () => {
    const choices: FlashChoice[] = ['off', 'on', 'auto'];
    for (const c of choices) expect(flashMode(c, 'back')).toBe(c);
  });

  it('the selfie camera lights the screen instead (Retina Flash on iPhone)', () => {
    expect(flashMode('on', 'front')).toBe('screen');
  });

  it('selfie auto lets the phone decide; off stays off', () => {
    expect(flashMode('auto', 'front')).toBe('auto');
    expect(flashMode('off', 'front')).toBe('off');
  });

  it('reads out the setting in sentence case', () => {
    expect(flashValueLabel('off')).toBe('Off');
    expect(flashValueLabel('on')).toBe('On');
    expect(flashValueLabel('auto')).toBe('Auto');
  });
});

describe('photo quality', () => {
  it('captures at full quality so the single JPEG encode is the only loss', () => {
    expect(PHOTO_CAPTURE.shotQuality).toBe(1);
  });

  it('saves the JPEG sharper than before (0.8) but no higher than 0.9, to keep uploads small', () => {
    expect(PHOTO_CAPTURE.jpegQuality).toBeGreaterThan(0.8);
    expect(PHOTO_CAPTURE.jpegQuality).toBeLessThanOrEqual(0.9);
  });
});

describe('tap to focus — where the tap lands on the live camera', () => {
  it('turns a tap into a 0–1 point on the camera view', () => {
    expect(focusPoint(100, 300, 400, 800)).toEqual({ x: 0.25, y: 0.375 });
  });

  it('keeps a tap on the very edge inside the view', () => {
    expect(focusPoint(-5, 900, 400, 800)).toEqual({ x: 0, y: 1 });
  });

  it('no point before the view has a size', () => {
    expect(focusPoint(10, 10, 0, 800)).toBeNull();
  });

  // The phone turns this view point into the sensor's point itself (the preview layer knows the
  // crop, the rotation and the selfie mirror), so the selfie camera sends the same view point.
  it('sends the point as seen on screen for both cameras (the phone does the mirroring)', () => {
    expect(focusPoint(100, 200, 400, 800)).toEqual({ x: 0.25, y: 0.25 });
  });

  it('centres the focus square on the tap', () => {
    expect(focusSquareOrigin(200, 400, 72, 400, 800)).toEqual({ left: 164, top: 364 });
  });

  it('keeps the focus square fully on screen near an edge', () => {
    expect(focusSquareOrigin(5, 795, 72, 400, 800)).toEqual({ left: 0, top: 728 });
  });
});

describe('tapFocusAvailable — only with the switch on and a build that can focus', () => {
  it('on: switch on, iPhone, the new build', () => {
    expect(tapFocusAvailable({ flagOn: true, platform: 'ios', nativeFocus: true })).toBe(true);
  });

  it('off on build 10 (no native focus), even with the switch on', () => {
    expect(tapFocusAvailable({ flagOn: true, platform: 'ios', nativeFocus: false })).toBe(false);
  });

  it('off with the switch off', () => {
    expect(tapFocusAvailable({ flagOn: false, platform: 'ios', nativeFocus: true })).toBe(false);
  });

  it('off on Android', () => {
    expect(tapFocusAvailable({ flagOn: true, platform: 'android', nativeFocus: true })).toBe(false);
  });
});

describe('shutter sound (switch shutter-sound, build 13)', () => {
  it('on an iPhone with the module: Apple’s shutter at the press, and the camera’s own one off', () => {
    expect(shutterSoundPlan({ flagOn: true, platform: 'ios', hasModule: true })).toEqual({
      playAtPress: true,
      cameraShutterSound: false,
    });
  });

  it('switch off: today’s sound, left to the camera', () => {
    expect(shutterSoundPlan({ flagOn: false, platform: 'ios', hasModule: true })).toEqual({
      playAtPress: false,
      cameraShutterSound: undefined,
    });
  });

  it('builds 10 to 12 (no module) and Android: today’s sound', () => {
    const today = { playAtPress: false, cameraShutterSound: undefined };
    expect(shutterSoundPlan({ flagOn: true, platform: 'ios', hasModule: false })).toEqual(today);
    expect(shutterSoundPlan({ flagOn: true, platform: 'android', hasModule: true })).toEqual(today);
  });
});
