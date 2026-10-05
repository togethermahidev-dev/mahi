import { useCallback, useEffect } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { hasActiveEntitlement } from '@/lib/purchases';
import { useAuthStore } from '@/store';
import { usePurchasesStore } from '@/store/purchasesStore';

/**
 * In-app purchases for the signed-in person. With the `purchases` flag off (default), on a build
 * without RevenueCat, or with no public key, `available` is false, RevenueCat is never configured
 * and every action is a no-op that reports unavailable.
 *
 * Mounting it configures RevenueCat once for this user (app user id = Supabase user id).
 */
export function usePurchases() {
  const userId = useAuthStore((s) => s.user?.id);
  const flagOn = useFeatureFlag('purchases');
  const availability = usePurchasesStore((s) => s.availability);
  const offering = usePurchasesStore((s) => s.offering);
  const customerInfo = usePurchasesStore((s) => s.customerInfo);
  const isLoading = usePurchasesStore((s) => s.isLoading);

  useEffect(() => {
    if (flagOn && userId) usePurchasesStore.getState().ensureConfigured(userId, flagOn);
  }, [flagOn, userId]);

  const available = flagOn && availability === 'ready';

  const hasEntitlement = useCallback(
    (id: string) => available && hasActiveEntitlement(customerInfo, id),
    [available, customerInfo]
  );
  const purchase = useCallback(
    (pkg: PurchasesPackage) => usePurchasesStore.getState().purchase(pkg),
    []
  );
  const restore = useCallback(() => usePurchasesStore.getState().restore(), []);
  const presentPaywall = useCallback(
    () => (available ? usePurchasesStore.getState().presentPaywall() : Promise.resolve(null)),
    [available]
  );

  return {
    available,
    availability: flagOn ? availability : 'off',
    offering: available ? offering : null,
    isLoading,
    hasEntitlement,
    purchase,
    restore,
    presentPaywall,
  };
}
