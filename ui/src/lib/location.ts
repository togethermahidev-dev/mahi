import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

/**
 * Per-post location: native permission + locally-cached consent + a one-shot,
 * rounded GPS fix. Mirrors `src/lib/otp.ts` — AsyncStorage-backed, typed, and
 * leaf-level (no upper-layer imports).
 *
 * Privacy posture (see RULES.md): location is **explicit opt-in per use**, the
 * user is asked **once** (decision cached locally to prevent re-prompt churn),
 * coordinates are **rounded to ~city-block precision** before they ever leave
 * this module, and we **omit low-quality fixes**. A denial or any error never
 * throws to the caller — it degrades to `null`/`false`.
 */

const CONSENT_KEY = '@mahi:location_consent';

/** Worse than this (in metres) and we drop the fix — accuracy is unusable. */
const MAX_ACCURACY_METERS = 100;

/** Decimal places kept on lat/lng. 3 dp ≈ 110m ≈ a city block. */
const COORD_DECIMALS = 3;

/** Cached consent decision: 'granted' once the OS permission has been allowed,
 *  'denied' once refused. Absent (null) means we have never asked. */
export type LocationConsent = 'granted' | 'denied';

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

/**
 * In-memory fast path mirroring otp.ts — once read/written we avoid hitting
 * AsyncStorage again this session. `undefined` = not yet loaded from storage,
 * `null` = loaded and confirmed absent (never asked).
 */
let consentCache: LocationConsent | null | undefined;

/**
 * PURE: round a coordinate to ~city-block precision (3 dp ≈ 110m) so we never
 * persist or transmit an exact-home fix. Side-effect-free and unit-testable.
 * Handles negatives and the rounding boundary deterministically.
 */
export function roundCoord(n: number): number {
  const factor = 10 ** COORD_DECIMALS;
  // Math.round on the scaled value gives standard half-up rounding for the
  // positive case and away-from-zero handling that stays symmetric enough for
  // city-block bucketing of negative coordinates. `+ 0` normalises `-0` → `0`
  // so a value that rounds to zero never carries a confusing negative sign.
  return Math.round(n * factor) / factor + 0;
}

/**
 * PURE: a permission response maps to a cached consent decision. Extracted so
 * the granted/denied decision logic is testable without the native module.
 */
export function consentFromGranted(granted: boolean): LocationConsent {
  return granted ? 'granted' : 'denied';
}

/**
 * PURE: a fix is usable only when accuracy is known and within tolerance.
 * `null` accuracy (unknown) is treated as too coarse to trust.
 */
export function isAccuracyAcceptable(accuracy: number | null): boolean {
  return accuracy != null && accuracy <= MAX_ACCURACY_METERS;
}

/**
 * Read the cached consent decision. Returns `null` if we have never asked.
 * Uses the in-memory fast path; falls back to AsyncStorage on first call.
 */
export async function getLocationConsent(): Promise<LocationConsent | null> {
  if (consentCache !== undefined) return consentCache;
  try {
    const raw = await AsyncStorage.getItem(CONSENT_KEY);
    consentCache = raw === 'granted' || raw === 'denied' ? raw : null;
  } catch {
    consentCache = null;
  }
  return consentCache;
}

/**
 * Persist the consent decision (and update the in-memory fast path).
 */
export async function setLocationConsent(decision: LocationConsent): Promise<void> {
  consentCache = decision;
  try {
    await AsyncStorage.setItem(CONSENT_KEY, decision);
  } catch (err) {
    console.log('[location] failed to persist consent', err);
  }
}

/**
 * Request foreground location permission **once**. If we already have a cached
 * decision, return it without re-prompting (the OS remembers too, but the cache
 * prevents re-prompt churn). On grant we cache 'granted'; on denial/error we
 * cache 'denied'. Never throws — returns a boolean `granted`.
 */
export async function requestLocationPermission(): Promise<boolean> {
  const cached = await getLocationConsent();
  if (cached !== null) return cached === 'granted';

  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    await setLocationConsent(consentFromGranted(granted));
    return granted;
  } catch (err) {
    console.log('[location] permission request failed', err);
    await setLocationConsent('denied');
    return false;
  }
}

/**
 * One-shot current location, rounded to ~city block. Returns `null` when:
 * consent is not granted, the fix is too coarse (> ~100m), or anything throws.
 * Uses Balanced accuracy and a single `getCurrentPositionAsync` (NOT a watch).
 */
export async function getCurrentLocation(): Promise<LocationCoords | null> {
  const cached = await getLocationConsent();
  if (cached !== 'granted') return null;

  try {
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    if (!isAccuracyAcceptable(coords.accuracy)) {
      console.log('[location] dropping low-accuracy fix', coords.accuracy);
      return null;
    }

    return {
      latitude: roundCoord(coords.latitude),
      longitude: roundCoord(coords.longitude),
    };
  } catch (err) {
    console.log('[location] getCurrentLocation failed', err);
    return null;
  }
}

/**
 * Test-only: reset the in-memory fast path so a fresh AsyncStorage read happens
 * on the next access. Mirrors how otp.ts state is cleared between flows.
 */
export function __resetLocationCacheForTests(): void {
  consentCache = undefined;
}
