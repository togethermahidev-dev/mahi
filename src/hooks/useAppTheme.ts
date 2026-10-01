import { useThemeStore } from '@/store';
import { COLORS, SIZE, SPACE, withAlpha } from '@/constants/tokens';

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
    offWhite: string;
    offBlack: string;
    /** Brand cyan used for streaks, shutter and highlights. */
    accent: string;
    /** Frosted fill behind floating glass where real glass/blur isn't available. */
    glassOnDark: string;
    glassOnLight: string;
  };
  /** Floating right-hand nav rail. */
  navRail: {
    /** Rail width; also the button size. */
    width: number;
    /** Gap from the screen's right safe edge. */
    edgeGap: number;
    /** Space between buttons. */
    gap: number;
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
    colors: {
      bg: dark ? COLORS.bgDark : COLORS.white,
      text: dark ? COLORS.offWhite : COLORS.offBlack,
      offWhite: COLORS.offWhite,
      offBlack: COLORS.offBlack,
      accent: COLORS.accent,
      glassOnDark: withAlpha(COLORS.bgDark, 0.72),
      glassOnLight: withAlpha(COLORS.white, 0.72),
    },
    navRail: { width: SIZE.z52, edgeGap: SPACE.s10, gap: SPACE.s6 },
  };
}
