/**
 * RevenueCat (react-native-purchases + react-native-purchases-ui), loaded only when this build
 * has the native modules.
 *
 * OTA updates reach build 10 too, which was built without RevenueCat. Nothing imports either
 * package at the top level: the loaders check `NativeModules.RNPurchases` (and
 * `NativeModules.RNPaywalls` for the paywall UI) — the names the packages themselves look up —
 * and only then require them. No module = purchases off (`purchasesAvailability`).
 * Tested in src/lib/__tests__/nativeLoaders.test.ts.
 */
import { NativeModules } from 'react-native';
import type PurchasesDefault from 'react-native-purchases';
import type RevenueCatUIDefault from 'react-native-purchases-ui';

export type PurchasesSdk = typeof PurchasesDefault;
export type PurchasesUi = typeof RevenueCatUIDefault;

let purchases: PurchasesSdk | null | undefined;
let purchasesUi: PurchasesUi | null | undefined;

function present(name: string): boolean {
  try {
    return NativeModules[name] != null;
  } catch {
    return false;
  }
}

/** True when this build has RevenueCat's native module. */
export function hasNativePurchases(): boolean {
  return present('RNPurchases');
}

/** Purchases (the SDK's default export), or null on a build without it. */
export function loadPurchases(): PurchasesSdk | null {
  if (purchases !== undefined) return purchases;
  if (!hasNativePurchases()) {
    purchases = null;
    return purchases;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    purchases = (require('react-native-purchases') as { default: PurchasesSdk }).default;
  } catch {
    purchases = null;
  }
  return purchases;
}

/** RevenueCatUI (paywalls), or null on a build without its native module. */
export function loadPurchasesUi(): PurchasesUi | null {
  if (purchasesUi !== undefined) return purchasesUi;
  if (!hasNativePurchases() || !present('RNPaywalls')) {
    purchasesUi = null;
    return purchasesUi;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    purchasesUi = (require('react-native-purchases-ui') as { default: PurchasesUi }).default;
  } catch {
    purchasesUi = null;
  }
  return purchasesUi;
}
