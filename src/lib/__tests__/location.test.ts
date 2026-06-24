/**
 * Pure-logic + consent-cache tests for per-post location.
 *
 * `expo-location` is mocked so this stays a node/ts-jest pure test (no native
 * module), and AsyncStorage is mocked to drive the consent-cache decision logic
 * without a device. We never touch real GPS here.
 */

// In-memory AsyncStorage double — the consent cache only ever uses get/set.
const store: Record<string, string> = {};
const mockGetItem = jest.fn((k: string) => Promise.resolve(store[k] ?? null));
const mockSetItem = jest.fn((k: string, v: string) => {
  store[k] = v;
  return Promise.resolve();
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => mockGetItem(k),
    setItem: (k: string, v: string) => mockSetItem(k, v),
  },
}));

// Native module stub. Tests that exercise permission/position install their own
// implementations per-case; the default exports just need to exist for import.
const mockRequestPermissions = jest.fn();
const mockGetCurrentPosition = jest.fn();

jest.mock('expo-location', () => ({
  __esModule: true,
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: () => mockRequestPermissions(),
  getCurrentPositionAsync: (opts: unknown) => mockGetCurrentPosition(opts),
}));

import {
  roundCoord,
  consentFromGranted,
  isAccuracyAcceptable,
  getLocationConsent,
  setLocationConsent,
  requestLocationPermission,
  getCurrentLocation,
  __resetLocationCacheForTests,
  type LocationConsent,
} from '@/lib/location';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockGetItem.mockClear();
  mockSetItem.mockClear();
  mockRequestPermissions.mockReset();
  mockGetCurrentPosition.mockReset();
  __resetLocationCacheForTests();
});

describe('roundCoord — ~city-block precision (3 dp ≈ 110m)', () => {
  it('rounds to 3 decimal places (the canonical case)', () => {
    expect(roundCoord(51.5073999)).toBe(51.507);
  });

  it('rounds half up at the 4th decimal', () => {
    expect(roundCoord(51.5075)).toBe(51.508);
    expect(roundCoord(0.0006)).toBe(0.001);
  });

  it('handles negative coordinates', () => {
    expect(roundCoord(-0.1277583)).toBe(-0.128);
    expect(roundCoord(-122.41941)).toBe(-122.419);
  });

  it('handles the zero and exact-boundary cases', () => {
    expect(roundCoord(0)).toBe(0);
    expect(roundCoord(12.345)).toBe(12.345);
    expect(roundCoord(-0.0004)).toBe(0); // rounds toward zero, no -0 surprises in equality
  });

  it('strips precision finer than a city block (privacy guarantee)', () => {
    // An exact-home-grade fix must collapse to the block bucket.
    const exactHome = 51.50739285;
    expect(roundCoord(exactHome)).toBe(51.507);
    expect(Math.abs(roundCoord(exactHome) - exactHome)).toBeLessThan(0.001);
  });
});

describe('consentFromGranted — pure permission→decision mapping', () => {
  it('maps granted=true to "granted"', () => {
    const d: LocationConsent = consentFromGranted(true);
    expect(d).toBe('granted');
  });

  it('maps granted=false to "denied"', () => {
    expect(consentFromGranted(false)).toBe('denied');
  });
});

describe('isAccuracyAcceptable — omit low-quality fixes', () => {
  it('accepts a fix within ~100m', () => {
    expect(isAccuracyAcceptable(5)).toBe(true);
    expect(isAccuracyAcceptable(100)).toBe(true);
  });

  it('rejects a fix worse than ~100m', () => {
    expect(isAccuracyAcceptable(100.1)).toBe(false);
    expect(isAccuracyAcceptable(500)).toBe(false);
  });

  it('rejects unknown (null) accuracy', () => {
    expect(isAccuracyAcceptable(null)).toBe(false);
  });
});

describe('consent cache (AsyncStorage mocked)', () => {
  it('returns null when no decision has ever been stored', async () => {
    expect(await getLocationConsent()).toBeNull();
  });

  it('persists a decision and reads it back', async () => {
    await setLocationConsent('granted');
    expect(mockSetItem).toHaveBeenCalledWith('@mahi:location_consent', 'granted');
    expect(await getLocationConsent()).toBe('granted');
  });

  it('uses the in-memory fast path after the first read (no second storage hit)', async () => {
    store['@mahi:location_consent'] = 'denied';
    expect(await getLocationConsent()).toBe('denied');
    expect(mockGetItem).toHaveBeenCalledTimes(1);
    // Second read is served from memory.
    expect(await getLocationConsent()).toBe('denied');
    expect(mockGetItem).toHaveBeenCalledTimes(1);
  });

  it('treats a corrupt stored value as "never asked" (null)', async () => {
    store['@mahi:location_consent'] = 'garbage';
    expect(await getLocationConsent()).toBeNull();
  });
});

describe('requestLocationPermission — asked once', () => {
  it('prompts and caches "granted" on first grant', async () => {
    mockRequestPermissions.mockResolvedValue({ granted: true });
    expect(await requestLocationPermission()).toBe(true);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(store['@mahi:location_consent']).toBe('granted');
  });

  it('does NOT re-prompt when a decision is already cached (RED case for churn)', async () => {
    store['@mahi:location_consent'] = 'denied';
    expect(await requestLocationPermission()).toBe(false);
    // Cached decision short-circuits — the OS prompt must never fire again.
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('caches "denied" and never throws when the native call rejects', async () => {
    mockRequestPermissions.mockRejectedValue(new Error('boom'));
    await expect(requestLocationPermission()).resolves.toBe(false);
    expect(store['@mahi:location_consent']).toBe('denied');
  });
});

describe('getCurrentLocation — null on no-consent / low-quality / error', () => {
  it('returns null without touching GPS when consent is not granted', async () => {
    store['@mahi:location_consent'] = 'denied';
    expect(await getCurrentLocation()).toBeNull();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });

  it('returns rounded coordinates for a good fix when granted', async () => {
    store['@mahi:location_consent'] = 'granted';
    mockGetCurrentPosition.mockResolvedValue({
      coords: { latitude: 51.5073999, longitude: -0.1277583, accuracy: 12 },
    });
    expect(await getCurrentLocation()).toEqual({ latitude: 51.507, longitude: -0.128 });
  });

  it('drops a low-accuracy fix (> ~100m) and returns null', async () => {
    store['@mahi:location_consent'] = 'granted';
    mockGetCurrentPosition.mockResolvedValue({
      coords: { latitude: 51.5073999, longitude: -0.1277583, accuracy: 250 },
    });
    expect(await getCurrentLocation()).toBeNull();
  });

  it('returns null (never throws) when the native call rejects', async () => {
    store['@mahi:location_consent'] = 'granted';
    mockGetCurrentPosition.mockRejectedValue(new Error('gps off'));
    await expect(getCurrentLocation()).resolves.toBeNull();
  });
});
