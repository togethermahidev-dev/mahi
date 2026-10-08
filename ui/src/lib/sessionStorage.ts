/**
 * Where Supabase keeps the sign-in session (docs/security.md): the iPhone keychain / Android
 * keystore through expo-secure-store, which ships in build 13. OTA updates also reach builds 10 to
 * 12, which don't have it, so the package is required only after
 * `requireOptionalNativeModule('ExpoSecureStore')` (null instead of a throw) says it's there;
 * without it the session stays in AsyncStorage as before.
 *
 * - A session already in AsyncStorage moves to the keychain the first time it's read, so nobody
 *   is signed out by the move.
 * - The keychain holds it in pieces (expo-secure-store warns above 2048 bytes per value).
 * - Readable after the first unlock (so the widget's background refresh can use it), on this
 *   device only (not carried to another phone by a backup).
 * - If the keychain refuses a write, the session goes to AsyncStorage rather than being lost,
 *   and the keychain copy is dropped so an older token never wins over the new one.
 * - The iPhone keychain survives deleting the app; AsyncStorage doesn't. So the first launch of an
 *   install (no install mark in AsyncStorage yet) wipes any session a deleted app left in the
 *   keychain before reading it — a reinstall never comes back signed in as the last person.
 * Tested in src/lib/__tests__/sessionStorage.test.ts.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reportError } from '@/lib/sentry';

type SecureStore = typeof import('expo-secure-store');

const PIECE = 1800;
/** In AsyncStorage, so it goes when the app is deleted. Set on this install's first launch. */
const INSTALL_MARK = '@mahi:install_started';

let secureStore: SecureStore | null | undefined;

function loadSecureStore(): SecureStore | null {
  if (secureStore === undefined) {
    try {
      secureStore =
        Platform.OS !== 'web' && requireOptionalNativeModule('ExpoSecureStore')
          ? // eslint-disable-next-line @typescript-eslint/no-require-imports
            (require('expo-secure-store') as SecureStore)
          : null;
    } catch {
      secureStore = null;
    }
  }
  return secureStore;
}

function options(s: SecureStore) {
  return { keychainAccessible: s.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
}

async function pieceCount(s: SecureStore, key: string): Promise<number> {
  const count = Number(await s.getItemAsync(`${key}.count`, options(s)));
  return Number.isInteger(count) && count > 0 ? count : 0;
}

async function readSecure(s: SecureStore, key: string): Promise<string | null> {
  const count = await pieceCount(s, key);
  if (!count) return null;
  const pieces = await Promise.all(
    Array.from({ length: count }, (_, i) => s.getItemAsync(`${key}.${i}`, options(s)))
  );
  return pieces.every((p) => p != null) ? pieces.join('') : null;
}

async function removeSecure(s: SecureStore, key: string, from = 0): Promise<void> {
  const count = await pieceCount(s, key);
  for (let i = from; i < count; i++) await s.deleteItemAsync(`${key}.${i}`, options(s));
  if (from === 0) await s.deleteItemAsync(`${key}.count`, options(s));
}

async function writeSecure(s: SecureStore, key: string, value: string): Promise<void> {
  const pieces: string[] = [];
  for (let i = 0; i < value.length; i += PIECE) pieces.push(value.slice(i, i + PIECE));
  if (!pieces.length) pieces.push('');
  await removeSecure(s, key, pieces.length);
  for (let i = 0; i < pieces.length; i++)
    await s.setItemAsync(`${key}.${i}`, pieces[i], options(s));
  await s.setItemAsync(`${key}.count`, String(pieces.length), options(s));
}

const freshInstallChecks = new Map<string, Promise<void>>();

/** Once per launch: on an install's first launch, drop a keychain session left by a deleted app. */
function clearLeftoverSession(s: SecureStore, key: string): Promise<void> {
  let check = freshInstallChecks.get(key);
  if (!check) {
    check = (async () => {
      if ((await AsyncStorage.getItem(INSTALL_MARK)) != null) return;
      await removeSecure(s, key);
      await AsyncStorage.setItem(INSTALL_MARK, '1');
    })().catch((err) =>
      reportError(err, { flow: 'auth', action: 'clearLeftoverSession', level: 'warning' })
    );
    freshInstallChecks.set(key, check);
  }
  return check;
}

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const s = loadSecureStore();
    if (!s) return AsyncStorage.getItem(key);
    await clearLeftoverSession(s, key);
    try {
      const value = await readSecure(s, key);
      if (value != null) return value;
    } catch (err) {
      reportError(err, { flow: 'auth', action: 'readSession', level: 'warning' });
    }
    const old = await AsyncStorage.getItem(key);
    if (old != null) {
      try {
        await writeSecure(s, key, old);
        await AsyncStorage.removeItem(key);
      } catch (err) {
        reportError(err, { flow: 'auth', action: 'moveSession', level: 'warning' });
      }
    }
    return old;
  },

  async setItem(key: string, value: string): Promise<void> {
    const s = loadSecureStore();
    if (!s) return AsyncStorage.setItem(key, value);
    await clearLeftoverSession(s, key);
    try {
      await writeSecure(s, key, value);
      await AsyncStorage.removeItem(key);
    } catch (err) {
      reportError(err, { flow: 'auth', action: 'saveSession', level: 'warning' });
      await removeSecure(s, key).catch(() => undefined);
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    const s = loadSecureStore();
    if (s) {
      await removeSecure(s, key).catch((err) =>
        reportError(err, { flow: 'auth', action: 'removeSession', level: 'warning' })
      );
    }
    await AsyncStorage.removeItem(key);
  },
};
