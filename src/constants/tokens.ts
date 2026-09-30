/**
 * Design tokens — the one place colours, text sizes, spacing and corner radii are written down.
 * Every style reads from here (fonts: ./fonts.ts). Values match what the screens used before the
 * tokens existed, so moving to tokens changed nothing on screen.
 *
 * Guarded by src/lib/__tests__/designTokens.test.ts: a raw colour, fontSize, padding/margin/gap
 * or borderRadius anywhere else fails the tests. Need a new value? Add a token here first.
 */

// ─── Colours ─────────────────────────────────────────────────────────────────
export const COLORS = {
  // Brand
  accent: '#59C2D7',
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
} as const;

/** A token colour at the given opacity: withAlpha(COLORS.offWhite, 0.45). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ─── Text sizes ──────────────────────────────────────────────────────────────
export const FONT_SIZE = {
  f8: 8,
  f10: 10,
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
