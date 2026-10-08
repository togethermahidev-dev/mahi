/**
 * Where the sign-in session is kept (docs/security.md): the iPhone keychain / Android keystore on
 * builds that have expo-secure-store (build 13+), the old AsyncStorage on builds that don't. A
 * session already in AsyncStorage moves to the keychain the first time it's read, so nobody is
 * signed out by the move.
 */
const expoModules: Record<string, unknown> = {};
const secureRequired = jest.fn();
const secure = new Map<string, string>();
const plain = new Map<string, string>();
const secureFails = { set: false };

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => expoModules[name] ?? null,
}));
jest.mock('expo-secure-store', () => {
  secureRequired();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
    getItemAsync: jest.fn(async (k: string) => secure.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      if (secureFails.set) throw new Error('keychain unavailable');
      secure.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      secure.delete(k);
    }),
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => plain.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      plain.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      plain.delete(k);
    }),
  },
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));

const KEY = 'sb-test-auth-token';
const LONG = 'x'.repeat(5000);

function load() {
  let mod: typeof import('@/lib/sessionStorage') | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@/lib/sessionStorage');
  });
  return mod!.sessionStorage;
}

beforeEach(() => {
  secure.clear();
  plain.clear();
  secureFails.set = false;
  secureRequired.mockClear();
  for (const k of Object.keys(expoModules)) delete expoModules[k];
});

describe('a build without expo-secure-store (builds 10–12)', () => {
  it('keeps the session in AsyncStorage and never loads the package', async () => {
    const store = load();
    await store.setItem(KEY, 'session');
    expect(plain.get(KEY)).toBe('session');
    expect(await store.getItem(KEY)).toBe('session');
    await store.removeItem(KEY);
    expect(plain.has(KEY)).toBe(false);
    expect(secureRequired).not.toHaveBeenCalled();
  });
});

describe('a build with expo-secure-store', () => {
  beforeEach(() => {
    expoModules.ExpoSecureStore = {};
  });

  it('keeps the session only in the keychain, in pieces, and reads it back whole', async () => {
    const store = load();
    await store.setItem(KEY, LONG);
    expect(plain.has(KEY)).toBe(false);
    expect([...secure.values()].every((v) => v.length <= 2000)).toBe(true);
    expect(await store.getItem(KEY)).toBe(LONG);
  });

  it('moves a session already in AsyncStorage to the keychain on first read', async () => {
    plain.set(KEY, 'old session');
    const store = load();
    expect(await store.getItem(KEY)).toBe('old session');
    expect(plain.has(KEY)).toBe(false);
    expect(await store.getItem(KEY)).toBe('old session');
  });

  it('a shorter session leaves no old pieces behind', async () => {
    const store = load();
    await store.setItem(KEY, LONG);
    await store.setItem(KEY, 'short');
    expect(await store.getItem(KEY)).toBe('short');
    expect([...secure.keys()].filter((k) => k.startsWith(KEY))).toHaveLength(2);
  });

  it('sign-out removes it everywhere', async () => {
    const store = load();
    await store.setItem(KEY, LONG);
    plain.set(KEY, 'stray');
    await store.removeItem(KEY);
    expect([...secure.keys()].filter((k) => k.startsWith(KEY))).toHaveLength(0);
    expect(plain.has(KEY)).toBe(false);
    expect(await store.getItem(KEY)).toBeNull();
  });

  it('if the keychain refuses a write, the session is kept (not lost) and no stale copy wins', async () => {
    const store = load();
    await store.setItem(KEY, 'first');
    secureFails.set = true;
    await store.setItem(KEY, 'rotated');
    expect(await store.getItem(KEY)).toBe('rotated');
  });
});
