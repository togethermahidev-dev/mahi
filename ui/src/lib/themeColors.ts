import { ALPHA, COLORS, withAlpha } from '@/constants/tokens';

/** The colours every screen shares, for the light or dark setting. */
export interface ThemeColors {
  bg: string;
  text: string;
  /** Secondary text: handles, times, hints (65% of the text colour: 4.5:1 or better). */
  muted: string;
  /** Hairlines between rows and around fields. */
  border: string;
  offWhite: string;
  offBlack: string;
  /** Brand cyan used for the shutter and highlights. */
  accent: string;
  /** The accent for words: deeper on light backgrounds so it reads at 4.5:1. */
  accentText: string;
  /** Red for words (Deny, errors): deeper on light backgrounds so it reads at 4.5:1. */
  dangerText: string;
  /** Frosted fill behind floating glass where real glass/blur isn't available. */
  glassOnDark: string;
  glassOnLight: string;
}

/** The light or dark colours every screen shares (also for parts handed `dark` as a prop). */
export function themeColors(dark: boolean): ThemeColors {
  const ink = dark ? COLORS.offWhite : COLORS.offBlack;
  return {
    bg: dark ? COLORS.bgDark : COLORS.white,
    text: ink,
    muted: withAlpha(ink, ALPHA.a65),
    border: withAlpha(ink, ALPHA.a12),
    offWhite: COLORS.offWhite,
    offBlack: COLORS.offBlack,
    accent: COLORS.accent,
    accentText: dark ? COLORS.accent : COLORS.accentText,
    dangerText: dark ? COLORS.danger : COLORS.dangerDeep,
    glassOnDark: withAlpha(COLORS.bgDark, ALPHA.a72),
    glassOnLight: withAlpha(COLORS.white, ALPHA.a72),
  };
}

/**
 * The pull-to-refresh spinner, the same on every list: the muted text colour (iOS `tintColor`,
 * Android `colors`) on the page's own background (Android's disc). Spread onto `RefreshControl`.
 */
export function refreshTint(dark: boolean): {
  tintColor: string;
  colors: string[];
  progressBackgroundColor: string;
} {
  const { muted, bg } = themeColors(dark);
  return { tintColor: muted, colors: [muted], progressBackgroundColor: bg };
}
