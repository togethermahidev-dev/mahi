import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@mahi/theme_mode';

export type ThemeMode = 'system' | 'light' | 'dark';

const CYCLE: Record<ThemeMode, ThemeMode> = {
  light:  'dark',
  dark:   'system',
  system: 'light',
};

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
  reset: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',

  setMode: (mode) => {
    set({ mode });
    AsyncStorage.setItem(THEME_KEY, mode).catch(() => null);
  },

  cycleMode: () => {
    get().setMode(CYCLE[get().mode]);
  },

  reset: () => {
    set({ mode: 'system' });
    AsyncStorage.removeItem(THEME_KEY).catch(() => null);
  },
}));

/** Call once at app cold-start to restore the persisted theme preference. */
export async function rehydrateTheme(): Promise<void> {
  const stored = await AsyncStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    useThemeStore.getState().setMode(stored);
  }
}
