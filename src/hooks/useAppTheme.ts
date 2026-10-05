import { useThemeStore } from '@/store';
import { COLORS, ALPHA, SIZE, SPACE, withAlpha } from '@/constants/tokens';

export type EffectiveColorScheme = 'light' | 'dark';

export interface AppTheme {
  /** Raw stored preference */
  mode: 'light' | 'dark';
  /** Resolved scheme */
  colorScheme: EffectiveColorScheme;
  /** Convenience boolean — true when effective scheme is dark */
  dark: boolean;
  colors: {
    bg: string;
    text: string;
    /** Secondary text: handles, times, hints. */
    muted: string;
    /** Hairlines between rows and around fields. */
    border: string;
    offWhite: string;
    offBlack: string;
    /** Brand cyan used for the shutter and highlights. */
    accent: string;
    /** Frosted fill behind floating glass where real glass/blur isn't available. */
    glassOnDark: string;
    glassOnLight: string;
  };
  /** Floating left-hand nav rail. */
  navRail: {
    /** Rail width; also the button size. */
    width: number;
    /** Gap from the screen's left safe edge. */
    edgeGap: number;
    /** Space between buttons. */
    gap: number;
  };
}

/** The light or dark colours every screen shares (also for parts handed `dark` as a prop). */
export function themeColors(dark: boolean): AppTheme['colors'] {
  const ink = dark ? COLORS.offWhite : COLORS.offBlack;
  return {
    bg: dark ? COLORS.bgDark : COLORS.white,
    text: ink,
    muted: withAlpha(ink, ALPHA.a45),
    border: withAlpha(ink, ALPHA.a12),
    offWhite: COLORS.offWhite,
    offBlack: COLORS.offBlack,
    accent: COLORS.accent,
    glassOnDark: withAlpha(COLORS.bgDark, ALPHA.a72),
    glassOnLight: withAlpha(COLORS.white, ALPHA.a72),
  };
}

/**
 * Drop-in replacement for `useColorScheme()` across the app.
 * Respects the user's stored preference (light / dark).
 * All screens should use `const { dark } = useAppTheme()` instead of
 * `useColorScheme()` directly.
 */
export function useAppTheme(): AppTheme {
  const mode = useThemeStore((s) => s.mode);

  const colorScheme: EffectiveColorScheme = mode;
  const dark = colorScheme === 'dark';

  return {
    mode,
    colorScheme,
    dark,
    colors: themeColors(dark),
    navRail: { width: SIZE.z52, edgeGap: SPACE.s10, gap: SPACE.s6 },
  };
}
