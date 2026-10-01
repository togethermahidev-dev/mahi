import { useEffect } from 'react';
import { Linking } from 'react-native';
import { parseInviteLink } from '@/lib/inviteLink';
import { useAuthStore, useInviteStore } from '@/store';

/**
 * Wires invite links into the app: one that opened it cold, one that arrived while it was
 * running, and the claim once somebody is signed in. Mounted once, at the top.
 */
export function useInviteLink(): void {
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    const take = (url: string | null) => {
      const token = parseInviteLink(url);
      if (token) useInviteStore.getState().setPending(token);
    };

    Linking.getInitialURL().then(take);
    const sub = Linking.addEventListener('url', ({ url }) => take(url));
    return () => sub.remove();
  }, []);

  // Claim as soon as there's an account to claim it for — straight after sign-up, or when a
  // link arrives while someone is already signed in.
  useEffect(() => {
    if (!userId) return;
    useInviteStore.getState().claimPending();
  }, [userId]);
}
