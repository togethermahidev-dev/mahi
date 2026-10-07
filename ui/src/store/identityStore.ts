import { create } from 'zustand';
import { createIdentitySession, getMyIdentityVerifications } from '@/api/identity';
import { loadDidit } from '@/lib/diditModule';
import {
  overallIdentityStatus,
  sdkResultHint,
  type IdentityHint,
  type IdentityStatus,
} from '@/lib/identityVerification';
import { reportError } from '@/lib/sentry';

/**
 * Identity checks (Didit), flag `identity-verification`. Nothing here runs unless a screen calls
 * it, and the hook only exposes it when the flag is on and this build has Didit.
 *
 * The status is always read fresh from the server (nothing kept on the device). `hint` is what
 * the phone saw when Didit's screens closed — shown while the server's answer arrives by webhook,
 * never treated as the decision.
 */
interface IdentityState {
  /** Server status, or null before the first load for this account. */
  status: IdentityStatus | null;
  isLoading: boolean;
  isChecking: boolean;
  hint: IdentityHint | null;
  /** Read the person's status from the server. */
  load: (userId: string) => Promise<{ error: Error | null }>;
  /** Start a check: server session → Didit's native screens → reload the server status. */
  startIdentityCheck: (
    userId: string
  ) => Promise<{ hint: IdentityHint | null; error: Error | null }>;
  reset: () => void;
}

const initial = { status: null, isLoading: false, isChecking: false, hint: null };

export const useIdentityStore = create<IdentityState>((set, get) => ({
  ...initial,

  load: async (userId) => {
    set({ isLoading: true });
    const { data, error } = await getMyIdentityVerifications(userId);
    if (error) {
      console.log('[identityStore] load failed', error.message);
      reportError(error, {
        flow: 'identity',
        action: 'load',
        extra: { table: 'identity_verifications' },
      });
      set({ isLoading: false });
      return { error };
    }
    set({ status: overallIdentityStatus(data ?? []), isLoading: false });
    return { error: null };
  },

  startIdentityCheck: async (userId) => {
    if (get().isChecking) return { hint: null, error: null };
    const sdk = loadDidit();
    if (!sdk) return { hint: null, error: new Error('Update Mahi to check your identity.') };

    set({ isChecking: true, hint: null });
    try {
      const { data: session, error } = await createIdentitySession();
      if (error || !session) {
        return { hint: null, error: error ?? new Error('Something went wrong. Please try again.') };
      }
      if (session.alreadyApproved) {
        set({ status: 'approved' });
        return { hint: 'approved', error: null };
      }

      const result = await sdk.startVerification(session.sessionToken);
      const hint = sdkResultHint(result);
      set({ hint });
      await get().load(userId);
      return { hint, error: null };
    } catch (err) {
      reportError(err, { flow: 'identity', action: 'startIdentityCheck' });
      return { hint: null, error: new Error('Something went wrong. Please try again.') };
    } finally {
      set({ isChecking: false });
    }
  },

  reset: () => set(initial),
}));
