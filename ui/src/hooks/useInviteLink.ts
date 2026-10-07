import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { claimOnReturn, parseInviteLink } from '@/lib/inviteLink';
import { reportError } from '@/lib/sentry';
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

    Linking.getInitialURL()
      .then(take)
      .catch((err) => reportError(err, { flow: 'invites', action: 'readOpeningLink' }));
    const sub = Linking.addEventListener('url', ({ url }) => take(url));
    return () => sub.remove();
  }, []);

  // Claim as soon as there's an account to claim it for — straight after sign-up, or when a
  // link arrives while someone is already signed in.
  useEffect(() => {
    if (!userId) return;
    useInviteStore.getState().claimPending();
  }, [userId]);

  // An invite kept through a dropped connection is tried again each time Mahi comes back to the
  // front.
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', (state) => {
      const invite = useInviteStore.getState();
      if (claimOnReturn(state, { signedIn: true, ...invite })) void invite.claimPending();
    });
    return () => sub.remove();
  }, [userId]);
}
