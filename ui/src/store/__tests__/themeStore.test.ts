/**
 * Mahi's light/dark setting is handed to the phone, so alerts, action sheets, keyboards, the
 * date picker and the share sheet follow Mahi's toggle instead of the phone's own setting.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
const setColorScheme = jest.fn();
const stored: Record<string, string> = {};

jest.mock('react-native', () => ({
  Appearance: { setColorScheme: (s: unknown) => setColorScheme(s) },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => stored[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      stored[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete stored[k];
    }),
  },
}));

import { useThemeStore, rehydrateTheme } from '@/store/themeStore';

const state = () => useThemeStore.getState();

beforeEach(() => {
  setColorScheme.mockClear();
  for (const k of Object.keys(stored)) delete stored[k];
});

describe('the phone follows Mahi', () => {
  it('setting dark tells the phone dark', () => {
    state().setMode('dark');
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
  });

  it('the toggle tells the phone each new mode', () => {
    state().setMode('light');
    state().cycleMode();
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    state().cycleMode();
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
  });

  it('logging out (reset) tells the phone light', () => {
    state().setMode('dark');
    state().reset();
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
  });

  it('on start with nothing saved, the phone is told light', async () => {
    await rehydrateTheme();
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
  });

  it('on start with dark saved, the phone is told dark', async () => {
    stored['@mahi/theme_mode'] = 'dark';
    useThemeStore.setState({ mode: 'light' });
    await rehydrateTheme();
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
  });
});
