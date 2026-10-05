import { useCallback, useEffect } from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { hasNativeDidit } from '@/lib/diditModule';
import { identityCheckAvailable } from '@/lib/identityVerification';
import { useAuthStore } from '@/store';
import { useIdentityStore } from '@/store/identityStore';

/**
 * Identity checks for the signed-in person. `available` is false unless the
 * `identity-verification` flag (default off) is on AND this build has Didit's native module;
 * when it's false nothing loads and `start` does nothing.
 */
export function useIdentityVerification() {
  const userId = useAuthStore((s) => s.user?.id);
  const available = identityCheckAvailable(
    useFeatureFlag('identity-verification'),
    hasNativeDidit()
  );
  const status = useIdentityStore((s) => s.status);
  const isLoading = useIdentityStore((s) => s.isLoading);
  const isChecking = useIdentityStore((s) => s.isChecking);
  const hint = useIdentityStore((s) => s.hint);

  useEffect(() => {
    if (available && userId) useIdentityStore.getState().load(userId);
  }, [available, userId]);

  const start = useCallback(async () => {
    if (!available || !userId) return { hint: null, error: null };
    return useIdentityStore.getState().startIdentityCheck(userId);
  }, [available, userId]);

  return { available, status, isLoading, isChecking, hint, start };
}
