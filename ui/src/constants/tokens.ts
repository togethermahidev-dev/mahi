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
  /** Time running short on a tag (under 6 hours): the camera pill's clock. */
  warning: '#FFC93B',
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
  z320: 320,
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
  /** A one-time tip, over everything on the page it explains. */
  coach: 600,
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
  /** The feed's like / comment icons on a small phone. */
  i28: 28,
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
/** React Native Image `blurRadius` (points): a picture reduced to colour, no detail. */
export const BLUR_RADIUS = {
  heavy: 24,
} as const;

export const BLUR_INTENSITY = {
  i35: 35,
  i40: 40,
  i60: 60,
  /** Nothing behind it can be read (a locked feed row). */
  i100: 100,
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
  /** The pulled-down camera springing back up. */
  pullBack: { damping: 20, stiffness: 240, mass: 0.8 },
  /** "+1" flying into the points counter: it lands, it doesn't bounce past. */
  fly: { damping: 20, stiffness: 220, mass: 0.8, overshootClamping: true },
} as const;

// ─── Motion: how big things grow or shrink (transform scale) ──────────────────
export const SCALE = {
  s0_68: 0.68,
  /** Full-screen content beginning or ending a restrained continuity morph. */
  s0_96: 0.96,
  /** Quiet instructional pulse: visible without reading as celebration. */
  s1_06: 1.06,
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
  /** A tip waits this long after its page settles (a swipe, a sheet closing) before it shows. */
  coachMark: 700,
  /** Follow requests deleted anywhere re-read the list at most this often (unfilterable DELETE). */
  requestsReread: 1500,
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

// ─── Android's emoji panel: it takes the keyboard's place under a composer ───
export const EMOJI_PANEL = {
  /** Its height before any keyboard has shown (a typical phone keyboard). */
  fallbackHeight: 300,
  /** Never shorter than this, so there are always rows to pick from. */
  minHeight: 220,
} as const;

// ─── Counts and shares that shape a layout ───────────────────────────────────
export const LAYOUT = {
  /** A complete progress bar, expressed as a percentage. */
  percentFull: 100,
  /** Columns in a profile's grid of posts. */
  profileColumns: 2,
  /** Start the next two-tile profile page shortly before the last row comes into view. */
  profileEndThreshold: 0.35,
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

// ─── Segmented control (Settings → Controls, the sign-up privacy choice) ────────
export const SEGMENTED = {
  /** The whole control: tall enough for a two-line option ("Everyone, I approve first"). */
  minHeight: SIZE.z44,
  /** The track's corners, and the gap between it and the chosen option's thumb. */
  radius: RADIUS.r14,
  inset: SPACE.s3,
  /** The chosen option's thumb, inset inside the track. */
  thumbRadius: RADIUS.r12,
  /** Lines an option's words wrap to before they are cut. */
  labelLines: 2,
  /** An option that can't be chosen (Everyone while private) is drawn at this opacity. */
  disabledOpacity: ALPHA.a40,
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
  /** The essential actions live beside the compact post details, not over the workout's centre. */
  actionsBottom: 0.26,
  /** The single shade behind the compact post details covers only the lower photo… */
  shadeHeight: 0.38,
  /** …stays nearly clear until it reaches the content… */
  shadeMid: 0.18,
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
  /** The second tap of a double tap (to like) must land within this long (ms). */
  doubleTapMs: 250,
  /** Responsive layout (feedLayout.ts): a phone shorter than this is small (iPhone SE, 8)… */
  smallPhoneH: 700,
  /** …and one at least this tall is tall (Pro Max, Plus). */
  tallPhoneH: 900,
  /** The buttons sit lower on a small phone, so the caption keeps its room. */
  actionsBottomSmall: 0.34,
  /** Text set this large or more (Settings > Text size) counts as large text. */
  largeText: 1.3,
  /** Large text: the shade grows to this share of the post. */
  shadeHeightLarge: 0.6,
  /** Caption lines: regular, tall phone, large text. */
  captionLines: 2,
  captionLinesTall: 3,
  captionLinesLarge: 4,
} as const;

// ─── Motion that brings screens to life (Reanimated; Reduce Motion gets fades) ──
export const MOTION = {
  /** A pressed button shrinks to this, then springs back. */
  pressScale: 0.94,
  /** Each list row fades in this much after the one above it (ms)… */
  staggerMs: 40,
  /** …up to this many rows; the rest come in together. */
  staggerMax: 8,
  /** Rows, banners and toasts rise this far (pt) as they fade in. */
  riseY: 12,
  /** The feed skeleton breathes between these opacities, this fast (ms) each way. */
  skeletonLow: 0.35,
  skeletonHigh: 0.7,
  skeletonMs: 900,
  /** "Tag answered" stays on the camera this long (ms) before the pill fades away. */
  celebrateMs: 2400,
  /** Points counting up to a new total (ms). */
  countUpMs: 700,
  /** A tag pill turning into a check. */
  morph: { damping: 14, stiffness: 180, mass: 0.8 },
  /** Shared geometry: destination content joins near the end; the moving image then disappears. */
  morphContentAt: 0.72,
  /** The camera and the feed on one screen (owner, 2026-10-08): the camera slides all the way up
   *  (about a sixth of the page, when the feed is locked: just room for why and one button);
   *  one swipe goes all the way (owner, 2026-10-09: no peek stop): it settles open or back
   *  closed by the share of the way gone (openAt) or a flick faster than this (pt/ms). The feed
   *  fades in, FEED over the shutter fades out and the bell circle's icons finish scrolling by
   *  peekShare of the way (once the first swipe's stop; now only where those cues finish).
   *  Camera to feed morph (owner, 2026-10-09): on the way up the camera shrinks to this scale,
   *  fading from this share of the way; the feed grows in from this scale, starting this share of
   *  the page lower. Their corners are the tab morph's (pageMorph.fromRadius). The "Switch to
   *  camera" pill at the top of the feed fades out over the first pillFadeShare of a swipe back. */
  cameraFeed: {
    openAt: 0.15,
    flick: 0.5,
    lockedShare: 0.16,
    peekShare: 0.3,
    cameraToScale: 0.6,
    cameraFadeFrom: 0.7,
    feedFromScale: 0.88,
    feedFromY: 0.08,
    pillFadeShare: 0.2,
  },
  /** The feed's see-through header (owner, 2026-10-09): it slides away once you've paged this far
   *  (pt) down and comes back once you've gone this far up (or reach the top), over this long
   *  (ms); it fades in over the last share of the camera to feed morph from fadeFrom. */
  feedHeader: { hideAfter: 24, ms: DURATION.d200, fadeFrom: 0.5 },
  /** The round button beside the bell (owner, 2026-10-09): its icon scrolls up and out of the
   *  circle as the next rises in, done by cameraFeed.peekShare of the way. While a photo is being taken or
   *  reviewed, or the post is going up (no roadmap button), the circle fades in over this share
   *  of that scroll. */
  bellPill: { fadeShare: 0.25 },
  /** FEED over the shutter (owner, 2026-10-09): each up-chevron rises this far (pt) over this
   *  long (ms), brightest this share of the way up, then gone; the upper one starts this long
   *  (ms) after the lower, on a loop. Reduce Motion: they stay still. */
  feedCue: { riseMs: 1200, staggerMs: 600, rise: 5, peakAt: 0.3 },
  /** A "no": the padlock line wiggles sideways this far (pt), this fast (ms a beat), when a
   *  locked row is tapped (owner, 2026-10-08). */
  shake: { x: 6, ms: 60 },
  /** A page growing in from a tab tap (owner, 2026-10-08): where it starts, before full size. */
  pageMorph: { fromScale: 0.94, fromRadius: 28 },
  morphImageUntil: 0.94,
  /** A button press and release. */
  press: { damping: 18, stiffness: 420, mass: 0.6 },
  /** The countdown ring's line width and size. */
  ringStroke: 3,
  ringSize: 22,

  // ─── Moments that make the clock feel alive (design research, 2026-10-07) ───
  /** The waiting camera, pulled down: how far it gives at most (pt, a rubber band), the share of
   *  that the layer behind it moves, and the scale that layer grows from as it shows. */
  pull: {
    limit: 48,
    parallax: 0.3,
    fromScale: 0.985,
    /** At the open detent the camera is a portrait card (3:4) filling the bottom half of the
     *  page, centred, with the background showing around it; the roadmap and card take the top
     *  half (owner, 2026-10-08). */
    collapsedHeightShare: 0.46,
    collapsedAspect: 0.75,
    collapsedInset: 16,
    /** Release after this share of the reveal and the camera completes opening. */
    openAt: 0.24,
    /** How far a release velocity projects when choosing the nearest drawer detent. */
    projectionMs: 180,
    /** The lit leading edge is strongest early, then settles to this quieter strength. */
    edgePeak: 0.62,
    edgeRest: 0.24,
    /** The camera only slides (no shrinking) for this share of the pull, and the pill's icon and
     *  the notice finish changing by it. The pull itself goes all the way in one swipe. */
    peekShare: 0.3,
    /** The pill's camera icon and arrow grow in from this scale as they morph. */
    glyphFromScale: 0.6,
    /** The standalone arrow gives two short downward jumps instead of showing an instruction pill. */
    arrowJumpY: 8,
    cameraFadeAt: 0.65,
  },
  /** The pull handle breathes out to this scale once, this fast (ms) each way, when it shows. */
  pullHandleScale: 1.12,
  pullHandleMs: 700,
  /** Reduce Motion: the pulled frost thins to this, instead of moving. */
  pullFrostLow: 0.85,
  /** "+1" holds this long (ms) near the shutter before it flies into the points counter… */
  holdBeatMs: 400,
  /** …along a curve that rises this far (pt) above the straight line… */
  flyArc: 64,
  /** …shrinking to this scale as it lands. */
  flyToScale: 0.5,
  /** The "@sam kept you going" card under the counter stays this long (ms). */
  flightCardMs: 3600,
  /** A milestone: this many accent dots of this size (pt) burst this far (pt) over this long (ms). */
  burstDots: 14,
  burstDotSize: 6,
  burstSpread: 56,
  burstMs: 900,
  /** Feed develop: after you post, each mate's post clears from this blur to sharp over this
   *  long (ms), each this much (ms) after the one before, up to this many; the rest clear together. */
  develop: { fromBlur: 60, ms: 900, staggerMs: 120, staggerMax: 6 },
  /** The last hour of a tag: the ring round the tagger's face breathes to this opacity, this
   *  fast (ms) each way. */
  urgentBreatheMs: 1400,
  urgentBreatheLow: 0.35,
  /** The last 6 hours: the ring round the tagger's face on the camera pill, and the face. */
  urgentRingSize: 34,
  urgentAvatarSize: 26,
  /** The "Answered @sam" stamp lands on the photo from this scale, tilted this much (deg), and
   *  holds this long (ms) before the photo lifts away. */
  stampFromScale: 1.3,
  stampTiltDeg: -6,
  stampHoldMs: 600,
  /** iOS 26: Apple's glass morphing the tag pill into the tick (SwiftUI spring: seconds, 0–1). */
  glassMorph: { response: 0.45, dampingFraction: 0.75 },
  /** After a miss, points rolling down to 0 (ms), not in red; the miss moment waits this long
   *  (ms) so the roll is seen first. */
  countDownMs: 900,
  missAfterRollMs: 1300,
  /** The profile's points bar fills toward your best over this long (ms), each time it opens. */
  barFillMs: 700,
} as const;

// ─── One-time tips (coach marks): the bright cut-out, its ring, the bubble and its arrow ──────
export const COACH = {
  /** Room around the thing a tip points at, inside the bright cut-out. */
  spotPad: 6,
  /** The cut-out's corners at most (a pill keeps fully round ends). */
  spotRadius: 16,
  /** How dark the page goes around the cut-out. */
  dim: 0.6,
  /** The ring around the cut-out breathes out to this scale and back… */
  pulseScale: 1.08,
  /** …this fast (ms) each way (still with Reduce Motion). */
  pulseMs: 900,
  /** The bubble springs in from this scale (Reduce Motion: it only fades). */
  enterScale: 0.96,
  /** The bubble at its widest. */
  bubbleWidth: 300,
  /** The bubble's arrow: its base and how far it reaches. */
  arrowWidth: 18,
  arrowHeight: 9,
  /** The bubble's glass: the colour over the blur, so it reads over a bright photo. */
  glass: 0.82,
  /** While a tip shows, the thing it points at is measured again this often (ms). */
  remeasureMs: 400,
  /** Apple's popover (iPhone): its content's width. */
  popoverWidth: 260,
} as const;

// ─── Hold-to-preview pop-up (iPhone, standard, no switch) ───────────────────────
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

/** Launch lens choreography: focus, capture, then open onto the live app. */
export const LAUNCH_LENS = {
  focus: 0.25,
  closed: 0.55,
  release: 0.6,
  focusMs: 560,
  closeMs: 240,
  holdMs: 180,
  openMs: 650,
  reducedMs: 240,
  focusRadius: 0.27,
  openRadius: 1.2,
  reticleSize: 232,
  ringSize: 300,
  focusScale: 1.12,
  blades: 6,
} as const;
