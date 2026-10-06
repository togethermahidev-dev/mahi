/**
 * Design tokens — the one place colours, text sizes, spacing and corner radii are written down.
 * Every style reads from here (fonts: ./fonts.ts). Values match what the screens used before the
 * tokens existed, so moving to tokens changed nothing on screen.
 *
 * Guarded by src/lib/__tests__/designTokens.test.ts: a raw colour, text size, spacing, radius,
 * shadow blur, size, position, icon size, letter spacing, line height or border width anywhere
 * else fails the tests. Need a new value? Add a token here first.
 */

// ─── Colours ─────────────────────────────────────────────────────────────────
export const COLORS = {
  // Brand
  accent: '#59C2D7',
  /** The accent for words on light backgrounds (the bright accent is too faint there: 2:1). */
  accentText: '#227A8C',
  gold: '#FFC93B',

  // Neutrals, light → dark
  white: '#FFFFFF',
  paper: '#FAFAF8',
  surfaceLight: '#F5F5F0',
  surfaceLight2: '#F0F0ED',
  offWhite: '#E8E8E3',
  iosSeparator: '#E5E5EA',
  grey999: '#999999',
  grey888: '#888888',
  borderDark: '#3A3A37',
  iosGreyDark: '#3A3A3C',
  surfaceDark: '#2A2A27',
  surfaceDark2: '#252521',
  bgDark: '#1C1C19',
  offBlack: '#1A1A17',
  inkSoft: '#121210',
  ink: '#111111',
  inkDeep: '#0F0F0D',
  black: '#000000',

  // Status
  danger: '#FF6B6B',
  dangerSoft: '#E06060',
  dangerAlt: '#E05A5A',
  dangerDeep: '#C03030',
  success: '#5DB075',
  successDeep: '#2D7A4F',
  info: '#4FA8FF',
  iosBlue: '#007AFF',
  amber: '#D4963A',
  amberDeep: '#B07020',
  /** Amber words on light backgrounds (readable at 4.5:1). */
  amberText: '#A5691E',
} as const;

/** A token colour at the given opacity: withAlpha(COLORS.offWhite, ALPHA.a45). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ─── See-through amounts (opacity, shadowOpacity, withAlpha) — a45 = 45% ─────
export const ALPHA = {
  a01: 0.01,
  a04: 0.04,
  a05: 0.05,
  a06: 0.06,
  a07: 0.07,
  a08: 0.08,
  a10: 0.1,
  a12: 0.12,
  a15: 0.15,
  a16: 0.16,
  a18: 0.18,
  a20: 0.2,
  a22: 0.22,
  a25: 0.25,
  a30: 0.3,
  a35: 0.35,
  a40: 0.4,
  a45: 0.45,
  a50: 0.5,
  a55: 0.55,
  a60: 0.6,
  a65: 0.65,
  a70: 0.7,
  a72: 0.72,
  a75: 0.75,
  a80: 0.8,
  a82: 0.82,
  a85: 0.85,
  a88: 0.88,
  a90: 0.9,
  a92: 0.92,
} as const;

// ─── Text sizes ──────────────────────────────────────────────────────────────
export const FONT_SIZE = {
  f11: 11,
  f12: 12,
  f13: 13,
  f14: 14,
  f15: 15,
  f16: 16,
  f17: 17,
  f18: 18,
  f20: 20,
  f22: 22,
  f24: 24,
  f28: 28,
  f32: 32,
  f38: 38,
  f48: 48,
  f56: 56,
} as const;

// ─── Spacing (padding, margin, gap) ──────────────────────────────────────────
// Negative offsets use a minus sign: marginTop: -SPACE.s4.
export const SPACE = {
  s1: 1,
  s2: 2,
  s3: 3,
  s4: 4,
  s5: 5,
  s6: 6,
  s7: 7,
  s8: 8,
  s9: 9,
  s10: 10,
  s12: 12,
  s14: 14,
  s15: 15,
  s16: 16,
  s18: 18,
  s20: 20,
  s22: 22,
  s24: 24,
  s28: 28,
  s32: 32,
  s34: 34,
  s36: 36,
  s40: 40,
  s48: 48,
  s50: 50,
  s56: 56,
  s60: 60,
  s64: 64,
  s80: 80,
  s96: 96,
  s120: 120,
} as const;

// ─── Corner radii ────────────────────────────────────────────────────────────
export const RADIUS = {
  r2: 2,
  r4: 4,
  r8: 8,
  r10: 10,
  r12: 12,
  r13: 13,
  r14: 14,
  r16: 16,
  r17: 17,
  r18: 18,
  r19: 19,
  r20: 20,
  r21: 21,
  r22: 22,
  r24: 24,
  r28: 28,
  r29: 29,
  r36: 36,
  r40: 40,
  r44: 44,
  r48: 48,
  r50: 50,
  /** Fully round ends, whatever the size. */
  pill: 999,
} as const;

// ─── Shadow blur (shadowRadius) ──────────────────────────────────────────────
export const SHADOW_BLUR = {
  b3: 3,
  b6: 6,
  b8: 8,
  b10: 10,
  b12: 12,
} as const;

// ─── Sizes (width, height, min/max) — negative use a minus: -SIZE.z8 ─────────
export const SIZE = {
  z1: 1,
  z2: 2,
  z3: 3,
  z4: 4,
  z8: 8,
  z10: 10,
  z20: 20,
  z24: 24,
  z26: 26,
  z28: 28,
  z30: 30,
  z32: 32,
  z36: 36,
  z38: 38,
  z40: 40,
  z42: 42,
  z44: 44,
  z46: 46,
  z48: 48,
  z50: 50,
  z52: 52,
  z55: 55,
  z56: 56,
  z58: 58,
  z60: 60,
  z64: 64,
  z70: 70,
  z72: 72,
  z80: 80,
  z88: 88,
  z90: 90,
  z96: 96,
  z100: 100,
  z120: 120,
  z130: 130,
  z132: 132,
  z160: 160,
  z170: 170,
  z180: 180,
  z200: 200,
  z360: 360,
  z400: 400,
  z420: 420,
  z800: 800,
} as const;

// ─── Position offsets (top, left, right, bottom) — negatives: -OFFSET.o4 ─────
export const OFFSET = {
  o3: 3,
  o4: 4,
  o6: 6,
  o8: 8,
  o10: 10,
  o12: 12,
  o14: 14,
  o16: 16,
  o20: 20,
  o24: 24,
  o32: 32,
  o34: 34,
  o40: 40,
  o44: 44,
  o48: 48,
  o50: 50,
  o60: 60,
  o70: 70,
  o72: 72,
  o80: 80,
  o108: 108,
  o120: 120,
  o140: 140,
  o142: 142,
  o170: 170,
} as const;

// ─── Icon sizes (the size prop) ──────────────────────────────────────────────
/** Stacking order of things that float over the pages, lowest first. */
export const LAYER = {
  /** Lifted just above its neighbours. */
  raised: 1,
  /** The Camera / Feed dots on the right edge. */
  dots: 100,
  /** The top header (MAHI, bell). */
  header: 200,
  /** The floating glass rail. */
  rail: 300,
  /** Search over a page. */
  overlay: 500,
  /** Someone's profile, opened over search. */
  profile: 510,
} as const;

/** Android shadow depth (elevation), lowest first. */
export const ELEVATION = {
  e3: 3,
  e4: 4,
  e6: 6,
  e8: 8,
  e12: 12,
} as const;

export const ICON_SIZE = {
  i14: 14,
  i16: 16,
  i20: 20,
  i22: 22,
  /** Material's standard tab bar icon (Android's native tab bar). */
  i24: 24,
  i32: 32,
  i80: 80,
} as const;

// ─── Letter spacing — negatives: -TRACKING.t1 ────────────────────────────────
export const TRACKING = {
  t0_5: 0.5,
  t1: 1,
  t1_5: 1.5,
  t2: 2,
  t2_5: 2.5,
  t3: 3,
  t4: 4,
  t5: 5,
  t8: 8,
  t10: 10,
} as const;

// ─── Line heights ────────────────────────────────────────────────────────────
export const LINE_HEIGHT = {
  l11: 11,
  l14: 14,
  l16: 16,
  l18: 18,
  l20: 20,
  l22: 22,
  l24: 24,
  l28: 28,
  l38: 38,
} as const;

// ─── Border widths (hairlines use StyleSheet.hairlineWidth) ──────────────────
export const BORDER_WIDTH = {
  w1: 1,
  w1_5: 1.5,
  w2: 2,
} as const;

// ─── Icon line widths (strokeWidth) ──────────────────────────────────────────
export const STROKE = {
  s1_2: 1.2,
  s1_4: 1.4,
  s1_5: 1.5,
  s1_8: 1.8,
  s2: 2,
} as const;

// ─── Glass blur strength (BlurView intensity, 0–100) ─────────────────────────
export const BLUR_INTENSITY = {
  i35: 35,
  i40: 40,
  i60: 60,
} as const;

// ─── Motion: how long things take (ms) ───────────────────────────────────────
export const DURATION = {
  d100: 100,
  d140: 140,
  d150: 150,
  d180: 180,
  d200: 200,
  d300: 300,
  d400: 400,
} as const;

// ─── Motion: springs (spread into Animated.spring or pass to withSpring) ──────
export const SPRING = {
  /** Pages, panels and sheets sliding in or back. */
  page: { damping: 22, stiffness: 160, mass: 0.9 },
  /** Search sliding in over a page. */
  overlay: { damping: 22, stiffness: 200 },
  /** A picked-up photo lifting, and dropping back. */
  lift: { damping: 12, stiffness: 200 },
  /** A dragged photo snapping to a corner, without overshooting. */
  snap: { damping: 16, stiffness: 140, overshootClamping: true },
  /** A zoomed photo settling back to its place. */
  settle: { damping: 18, stiffness: 160 },
  /** The captured photo landing in the preview. */
  land: { damping: 16, stiffness: 110, mass: 0.9 },
  /** The like medal popping up. */
  medal: { speed: 30, bounciness: 8 },
  /** The light / dark toggle pressing in, without a bounce… */
  press: { speed: 60, bounciness: 0 },
  /** …and bouncing back. */
  bounce: { damping: 10, stiffness: 200, mass: 0.6 },
  /** Nav rail selector: the trailing edge catching up onto the new icon… */
  railContract: { damping: 18, stiffness: 240, mass: 0.7 },
  /** …and following a dragging finger: the leading edge keeps up, the trailing edge lags. */
  railLead: { damping: 24, stiffness: 600, mass: 0.5 },
  railTrail: { damping: 22, stiffness: 260, mass: 0.6 },
} as const;

// ─── Motion: how big things grow or shrink (transform scale) ──────────────────
export const SCALE = {
  s0_68: 0.68,
  s1_1: 1.1,
  s1_3: 1.3,
  s4: 4,
} as const;

// ─── Waits: how long things stay or wait (ms) ────────────────────────────────
export const WAIT = {
  /** Search runs once typing pauses this long. */
  search: 350,
  /** A toast stays at least this long (up to 6 words)… */
  toastMin: 4000,
  /** …this much longer for each 5 words past 6… */
  toastPerFiveWords: 1000,
  /** …never longer than this… */
  toastMax: 10000,
  /** …and at least this long when it has a button. */
  toastAction: 8000,
  /** The least an older caller asks for when a toast explains something to act on. */
  toastLong: 5000,
} as const;

// ─── Swipes: when a drag counts, and when it moves or closes something ───────
export const SWIPE = {
  /** A swipe takes over once the finger moves this far (px) along its axis. */
  slop: 20,
  /** A drag this far (px)… */
  distance: 60,
  /** …or a flick this fast (px per ms) moves a page or closes an overlay. */
  velocity: 0.4,
} as const;

// ─── Counts and shares that shape a layout ───────────────────────────────────
export const LAYOUT = {
  /** A complete progress bar, expressed as a percentage. */
  percentFull: 100,
  /** Columns in a profile's grid of posts. */
  profileColumns: 3,
  /** Tagged friends' bubbles shown before "+n". */
  taggedBubbles: 3,
  /** The most lines a toast wraps to before it is cut. */
  toastLines: 3,
  /** The phone's text size from which text counts as large (1 = the default size). */
  largeTextScale: 1.35,
  /** The most lines a toast wraps to at large text. */
  toastLinesLarge: 6,
  /** The Mahi wordmark is already display size: it doesn't grow with the text setting. */
  wordmarkMaxScale: 1,
  /** Pages of someone's posts read past the first to find a post a notification opens. */
  viewerExtraPages: 2,
  /** Search results' height at most, as a share of the window. */
  searchResultsHeight: 0.55,
  /** The camera's small photo never gets shorter than this share of its width. */
  pipMinHeight: 0.6,
  /** Cards from the end of a profile's workout story at which the next page starts loading. */
  storyLoadAhead: 2,
} as const;

// ─── Floating nav rail: the pill outline and shadow (with SHADOW_BLUR / SIZE) ────
export const NAV_RAIL = {
  /** Pill outline: white at this opacity on dark screens (owner: a clearly visible pill). */
  outlineOnDark: 0.6,
  /** Pill outline: ink at this opacity on light screens. */
  outlineOnLight: 0.35,
  /** The soft shadow the pill floats on. */
  shadowOpacity: 0.22,
  /** Press and hold this long (ms) to pick up the selector; a drag along the rail picks it up at once. */
  holdMs: 280,
} as const;

// ─── Full-screen posts (feed and post viewer) ───────────────────────────────────
export const POST_CARD = {
  /** The like / comment column's bottom edge, as a share of the post's height: near the middle,
   *  in line with Reels (founder, 2026-10-05: "move further up a bit"; was 0.3). */
  actionsBottom: 0.4,
  /** The shade behind the name, caption and buttons covers this share of the post, full width… */
  shadeHeight: 0.5,
  /** …darkening to this opacity part-way down (behind the buttons)… */
  shadeMid: 0.35,
  /** …and this at the bottom (behind the name and caption). */
  shadeBottom: 0.7,
  /** The soft shadow under the like / comment icons and counts, so they read on light photos. */
  actionsShadow: 0.4,
  /** Press and hold a post this long (ms) to see the whole photo: everything over it fades… */
  holdMs: 250,
  /** …out this fast (ms)… */
  hideMs: 160,
  /** …and back this fast (ms) on release. */
  showMs: 220,
} as const;

// ─── Hold-to-preview pop-up (iPhone, flag context-menu-preview) ─────────────────
export const PREVIEW_MENU = {
  /** A post's preview: this share of the screen's width… */
  postWidth: 0.86,
  /** …height to width as the camera's portrait photos (3:4)… */
  postAspect: 4 / 3,
  /** …and never taller than this share of the screen, so the menu fits below. */
  postMaxHeight: 0.6,
  /** A chat's preview: this share of the screen's width… */
  chatWidth: 0.86,
  /** …and this share of its height. */
  chatHeight: 0.45,
} as const;

// ─── Full-screen viewers: a profile's posts and a profile picture (the swipe values also
// drive the Settings panel and a profile's swipe back) ─────────────────────────────
export const VIEWER = {
  /** A swipe closes the viewer past this distance (px)… */
  closeDistance: 80,
  /** …or when flicked at this speed (px per second). */
  closeVelocity: 500,
  /** How long the viewer takes to slide away once a swipe closes it (ms). */
  closeMs: 200,
  /** The dark background fades out over this much drag (px) while closing. */
  fadeDistance: 300,
  /** A swipe that doesn't close springs back with this feel. */
  snapBack: { damping: 22, stiffness: 220 },
  /** Profile picture zoom: fitted to the screen, the most a pinch allows, and a double tap. */
  zoomMin: 1,
  zoomMax: 4,
  zoomDoubleTap: 2.5,
  /** A profile picture opens as a circle this share of the screen's short side (founder: a big
   *  square was too invasive). */
  avatarShare: 0.72,
  /** Pinch to zoom on a post's photo: the most it allows; letting go springs it back. */
  pinchMax: 4,
} as const;

// ─── Live camera: the flash button and tap to focus (flag camera-tap-focus) ─────
export const CAMERA = {
  /** A tap to focus shows a square that lands this much bigger and settles to its size… */
  focusStartScale: 1.35,
  /** …over this long (ms)… */
  focusSettleMs: 200,
  /** …stays this long (ms)… */
  focusHoldMs: 800,
  /** …and fades over this long (ms). With Reduce Motion it only appears and fades. */
  focusFadeMs: 300,
  /** With tap to focus on, a second tap within this long (ms) flips the camera instead. */
  doubleTapMs: 280,
  /** Android: how often (ms) the tilt sensor reports, to turn photos taken sideways… */
  tiltUpdateMs: 400,
  /** …and how far sideways gravity must lead before the phone counts as held sideways. */
  tiltLead: 0.35,
} as const;
