import { Platform } from 'react-native';
import { create } from 'zustand';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { env } from '@/lib/env';
import { hasNativePurchases, loadPurchases, loadPurchasesUi } from '@/lib/purchasesModule';
import {
  configureStep,
  isPurchaseCancelled,
  purchasesApiKey,
  purchasesAvailability,
  type PurchasesAvailability,
} from '@/lib/purchases';
import { Sentry } from '@/lib/sentry';

/**
 * In-app purchases (RevenueCat), flag `purchases`. Nothing here touches RevenueCat unless
 * `ensureConfigured` is called with the flag on, this build has the native module and the
 * platform's public key is set. RevenueCat's user id is the Supabase user id.
 *
 * Offerings and customer info are read fresh from RevenueCat each app run (its SDK does its own
 * caching); nothing is written to the device here.
 */
interface PurchasesState {
  availability: PurchasesAvailability;
  /** The Supabase user RevenueCat is logged in as, or null. */
  currentUser: string | null;
  offering: PurchasesOffering | null;
  customerInfo: CustomerInfo | null;
  isLoading: boolean;
  /** Configure once (or log in the new user), then load the offering and customer info. */
  ensureConfigured: (userId: string, flagOn: boolean) => Promise<PurchasesAvailability>;
  refresh: () => Promise<void>;
  purchase: (
    pkg: PurchasesPackage
  ) => Promise<{ customerInfo: CustomerInfo | null; cancelled: boolean; error: Error | null }>;
  restore: () => Promise<{ customerInfo: CustomerInfo | null; error: Error | null }>;
  /** RevenueCat's paywall for the current offering. Returns its result, or null when unavailable. */
  presentPaywall: () => Promise<string | null>;
  /** Sign-out: log RevenueCat out (if it was used) and clear state. */
  reset: () => void;
}

// Purchases.configure may run only once per app run, whatever happens to the store.
let everConfigured = false;
let configuring: Promise<PurchasesAvailability> | null = null;

const initial = {
  availability: 'off' as PurchasesAvailability,
  currentUser: null,
  offering: null,
  customerInfo: null,
  isLoading: false,
};

function report(err: unknown, action: string): Error {
  console.log(`[purchasesStore] ${action} failed`, err instanceof Error ? err.message : err);
  Sentry.captureException(err, { tags: { flow: 'purchases', action } });
  return new Error('Something went wrong. Please try again.');
}

export const usePurchasesStore = create<PurchasesState>((set, get) => ({
  ...initial,

  ensureConfigured: async (userId, flagOn) => {
    const apiKey = purchasesApiKey(Platform.OS, {
      ios: env.revenueCatIosKey,
      android: env.revenueCatAndroidKey,
    });
    const availability = purchasesAvailability({
      flagOn,
      nativePresent: hasNativePurchases(),
      apiKey,
    });
    if (availability !== 'ready' || !apiKey) {
      set({ availability });
      return availability;
    }
    const sdk = loadPurchases();
    if (!sdk) {
      set({ availability: 'not-in-build' });
      return 'not-in-build';
    }
    if (configuring) return configuring;

    configuring = (async () => {
      try {
        const step = configureStep({ everConfigured, currentUser: get().currentUser }, userId);
        if (step === 'configure') {
          sdk.configure({ apiKey, appUserID: userId });
          everConfigured = true;
          sdk.addCustomerInfoUpdateListener((info) => set({ customerInfo: info }));
        } else if (step === 'log-in') {
          await sdk.logIn(userId);
        }
        set({ availability: 'ready', currentUser: userId });
        await get().refresh();
      } catch (err) {
        report(err, 'configure');
      } finally {
        configuring = null;
      }
      return get().availability;
    })();
    return configuring;
  },

  refresh: async () => {
    const sdk = loadPurchases();
    if (!sdk || get().availability !== 'ready') return;
    set({ isLoading: true });
    try {
      const [offerings, customerInfo] = await Promise.all([
        sdk.getOfferings(),
        sdk.getCustomerInfo(),
      ]);
      set({ offering: offerings.current ?? null, customerInfo });
    } catch (err) {
      report(err, 'refresh');
    } finally {
      set({ isLoading: false });
    }
  },

  purchase: async (pkg) => {
    const sdk = loadPurchases();
    if (!sdk || get().availability !== 'ready') {
      return {
        customerInfo: null,
        cancelled: false,
        error: new Error('Purchases aren’t available.'),
      };
    }
    try {
      const { customerInfo } = await sdk.purchasePackage(pkg);
      set({ customerInfo });
      return { customerInfo, cancelled: false, error: null };
    } catch (err) {
      if (isPurchaseCancelled(err)) return { customerInfo: null, cancelled: true, error: null };
      return { customerInfo: null, cancelled: false, error: report(err, 'purchase') };
    }
  },

  restore: async () => {
    const sdk = loadPurchases();
    if (!sdk || get().availability !== 'ready') {
      return { customerInfo: null, error: new Error('Purchases aren’t available.') };
    }
    try {
      const customerInfo = await sdk.restorePurchases();
      set({ customerInfo });
      return { customerInfo, error: null };
    } catch (err) {
      return { customerInfo: null, error: report(err, 'restore') };
    }
  },

  presentPaywall: async () => {
    const ui = loadPurchasesUi();
    if (!ui || get().availability !== 'ready') return null;
    try {
      const offering = get().offering;
      const result = await ui.presentPaywall(offering ? { offering } : {});
      await get().refresh();
      return result;
    } catch (err) {
      report(err, 'presentPaywall');
      return null;
    }
  },

  reset: () => {
    const sdk = everConfigured ? loadPurchases() : null;
    if (sdk && get().currentUser) {
      sdk.logOut().catch(() => {});
    }
    set(initial);
  },
}));
