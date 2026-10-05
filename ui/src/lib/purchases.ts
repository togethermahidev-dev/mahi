/**
 * In-app purchases (RevenueCat), flag `purchases`, default off. Pure rules only — no SDK — so
 * they are unit-tested (src/lib/__tests__/purchases.test.ts). The SDK is loaded by
 * src/lib/purchasesModule.ts and driven by src/store/purchasesStore.ts.
 *
 * RevenueCat is configured at most once per app run, and only when the flag is on AND this build
 * has the native module AND a public key is set for the platform. Its user id is the Supabase
 * user id; a different account on the same phone switches with logIn, sign-out logs out.
 */

export type PurchasesKeys = { ios: string | null; android: string | null };

/** The public RevenueCat key for this platform, or null when there isn't one. */
export function purchasesApiKey(os: string, keys: PurchasesKeys): string | null {
  const key = os === 'ios' ? keys.ios : os === 'android' ? keys.android : null;
  return key ? key : null;
}

export type PurchasesAvailability = 'off' | 'not-in-build' | 'no-key' | 'ready';

export function purchasesAvailability(input: {
  flagOn: boolean;
  nativePresent: boolean;
  apiKey: string | null;
}): PurchasesAvailability {
  if (!input.flagOn) return 'off';
  if (!input.nativePresent) return 'not-in-build';
  if (!input.apiKey) return 'no-key';
  return 'ready';
}

/** What to do so RevenueCat's user is `userId`: configure (first time), log in, or nothing. */
export function configureStep(
  state: { everConfigured: boolean; currentUser: string | null },
  userId: string
): 'configure' | 'log-in' | 'none' {
  if (!state.everConfigured) return 'configure';
  return state.currentUser === userId ? 'none' : 'log-in';
}

/** Whether customer info has `id` among its active entitlements. */
export function hasActiveEntitlement(
  info: { entitlements: { active: Record<string, unknown> } } | null,
  id: string
): boolean {
  return info != null && info.entitlements.active[id] != null;
}

/** RevenueCat rejects with `userCancelled: true` when the person closes the purchase sheet. */
export function isPurchaseCancelled(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { userCancelled?: unknown }).userCancelled === true
  );
}
