import { useEffect } from 'react';
import { useAuthStore, useFollowRequestStore } from '@/store';

/**
 * Follow requests to my private account while `active` (a screen showing them is open): a
 * loading state, then a fresh read, then live changes. Never kept on the phone.
 */
export function useFollowRequests(active: boolean) {
  const userId = useAuthStore((s) => s.user?.id);
  const requests = useFollowRequestStore((s) => s.requests);
  const failed = useFollowRequestStore((s) => s.failed);

  useEffect(() => {
    if (!active || !userId) return;
    const store = useFollowRequestStore.getState();
    store.clear();
    void store.load();
    return store.subscribe(userId);
  }, [active, userId]);

  return {
    requests,
    failed,
    isLoading: requests === null && !failed,
    reload: () => useFollowRequestStore.getState().load(),
    respond: (requesterId: string, accept: boolean) =>
      userId
        ? useFollowRequestStore.getState().respond(userId, requesterId, accept)
        : Promise.resolve({ data: null, error: new Error('Not signed in') }),
  };
}
