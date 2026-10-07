import { create } from 'zustand';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reportError } from '@/lib/sentry';

const THEME_KEY = '@mahi/theme_mode';

export type ThemeMode = 'light' | 'dark';

const CYCLE: Record<ThemeMode, ThemeMode> = {
  light: 'dark',
  dark: 'light',
};

/**
 * Hand Mahi's setting to the phone, so the parts the phone draws itself (alerts, action sheets,
 * keyboards, the date picker, the share sheet) follow Mahi's toggle, not the phone's own setting.
 */
function tellPhone(mode: ThemeMode): void {
  Appearance.setColorScheme(mode);
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
  reset: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'light',

  setMode: (mode) => {
    set({ mode });
    tellPhone(mode);
    AsyncStorage.setItem(THEME_KEY, mode).catch((err) =>
      reportError(err, { flow: 'settings', action: 'saveTheme', level: 'warning' })
    );
  },

  cycleMode: () => {
    get().setMode(CYCLE[get().mode]);
  },

  reset: () => {
    set({ mode: 'light' });
    tellPhone('light');
    AsyncStorage.removeItem(THEME_KEY).catch((err) =>
      reportError(err, { flow: 'settings', action: 'clearTheme', level: 'warning' })
    );
  },
}));

/** Call once at app cold-start to restore the persisted theme preference. */
export async function rehydrateTheme(): Promise<void> {
  const stored = await AsyncStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') {
    useThemeStore.getState().setMode(stored);
  } else {
    tellPhone(useThemeStore.getState().mode);
  }
}
