/**
 * Camera capture rules, pure and unit-tested: the flash setting, photo quality, and where a tap
 * to focus lands (flag `camera-tap-focus`, build 11 and later).
 */

// ─── Flash ───────────────────────────────────────────────────────────────────

/** What the flash button is set to. Kept for this app session only. */
export type FlashChoice = 'off' | 'on' | 'auto';

/** expo-camera's `flash` prop. */
export type CameraFlashMode = FlashChoice | 'screen';

const FLASH_ORDER: FlashChoice[] = ['off', 'on', 'auto'];

/** Each tap of the flash button: off → on → auto → off. */
export function nextFlash(choice: FlashChoice): FlashChoice {
  return FLASH_ORDER[(FLASH_ORDER.indexOf(choice) + 1) % FLASH_ORDER.length];
}

/**
 * The flash the camera uses. The selfie side has no flash bulb: "on" lights the screen instead
 * (Retina Flash on iPhone, screen flash on Android), and "auto" lets the phone decide.
 */
export function flashMode(choice: FlashChoice, facing: 'back' | 'front'): CameraFlashMode {
  if (facing === 'front' && choice === 'on') return 'screen';
  return choice;
}

/** The flash setting as VoiceOver reads it. */
export function flashValueLabel(choice: FlashChoice): string {
  return choice === 'off' ? 'Off' : choice === 'on' ? 'On' : 'Auto';
}

// ─── Photo quality ───────────────────────────────────────────────────────────

/**
 * Photos are taken at full quality, then saved once as a JPEG at 0.9 when the orientation is
 * flattened into the pixels (that step always re-encodes). Before, both steps used 0.8, so every
 * photo was compressed twice. A 12 MP JPEG at 0.9 is about 3–4 MB: quick to upload, far under
 * the `posts` bucket's 50 MB limit, and visibly sharper full-screen than 0.8. Above 0.9 a JPEG
 * grows fast for little you can see.
 */
export const PHOTO_CAPTURE = {
  /** takePictureAsync quality: no loss before the one real encode. */
  shotQuality: 1,
  /** The single JPEG encode that is uploaded. */
  jpegQuality: 0.9,
} as const;

// ─── Tap to focus ────────────────────────────────────────────────────────────

/**
 * A tap on the live camera as a 0–1 point on the camera view (0,0 top left), kept inside it.
 * The phone turns this into the sensor's point itself: the preview layer knows how the picture is
 * cropped to fill the screen, how the sensor is turned for portrait, and that the selfie preview
 * is mirrored — so both cameras send the point exactly as it is on screen. Null before layout.
 */
export function focusPoint(
  tapX: number,
  tapY: number,
  width: number,
  height: number
): { x: number; y: number } | null {
  if (width <= 0 || height <= 0) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp(tapX / width), y: clamp(tapY / height) };
}

/** Top-left of the focus square, centred on the tap and kept fully on screen. */
export function focusSquareOrigin(
  tapX: number,
  tapY: number,
  size: number,
  width: number,
  height: number
): { left: number; top: number } {
  const clamp = (v: number, max: number) => Math.min(Math.max(0, max), Math.max(0, v));
  return {
    left: clamp(tapX - size / 2, width - size),
    top: clamp(tapY - size / 2, height - size),
  };
}

/**
 * Tap to focus runs only with the switch on, on an iPhone, on a build whose camera can focus on a
 * point (build 11+). OTA updates also reach build 10, which can't: there it is as if switched off.
 */
export function tapFocusAvailable({
  flagOn,
  platform,
  nativeFocus,
}: {
  flagOn: boolean;
  platform: string;
  nativeFocus: boolean;
}): boolean {
  return flagOn && platform === 'ios' && nativeFocus;
}
