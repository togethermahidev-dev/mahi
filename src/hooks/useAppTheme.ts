import { useColorScheme } from 'react-native';
import { useThemeStore } from '@/store';

export type EffectiveColorScheme = 'light' | 'dark';

export interface AppTheme {
  /** Raw stored preference */
  mode: 'system' | 'light' | 'dark';
  /** Resolved scheme — system preference is applied when mode === 'system' */
  colorScheme: EffectiveColorScheme;
  /** Convenience boolean — true when effective scheme is dark */
  dark: boolean;
  colors: {
    bg:       string;
    text:     string;
    offWhite: string;
    offBlack: string;
  };
}

/**
 * Drop-in replacement for `useColorScheme()` across the app.
 * Respects the user's stored preference (light / dark / system).
 * All screens should use `const { dark } = useAppTheme()` instead of
 * `useColorScheme()` directly.
 */
export function useAppTheme(): AppTheme {
  const mode         = useThemeStore((s) => s.mode);
  const systemScheme = useColorScheme() ?? 'light';

  const colorScheme: EffectiveColorScheme =
    mode === 'system' ? systemScheme : mode;

  const dark = colorScheme === 'dark';

  return {
    mode,
    colorScheme,
    dark,
    colors: {
      bg:       dark ? '#1C1C19' : '#FFFFFF',
      text:     dark ? '#E8E8E3' : '#1A1A17',
      offWhite: '#E8E8E3',
      offBlack: '#1A1A17',
    },
  };
}
