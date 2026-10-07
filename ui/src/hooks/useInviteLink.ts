import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { claimOnReturn, parseInviteLink } from '@/lib/inviteLink';
import { track } from '@/lib/analytics';
import { reportError } from '@/lib/sentry';
import { useAuthStore, useInviteStore, useUserStore } from '@/store';

/**
 * Wires invite links into the app: one that opened it cold, one that arrived while it was
 * running, and the claim once somebody is signed in. Mounted once, at the top.
 */
export function useInviteLink(): void {
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    const take = (url: string | null, cold: boolean) => {
      const token = parseInviteLink(url);
      if (!token) return;
      useInviteStore.getState().setPending(token);
      track('invite_link_opened', { cold, signed_in: !!useAuthStore.getState().user });
    };

    Linking.getInitialURL()
      .then((url) => take(url, true))
      .catch((err) => reportError(err, { flow: 'invites', action: 'readOpeningLink' }));
    const sub = Linking.addEventListener('url', ({ url }) => take(url, false));
    return () => sub.remove();
  }, []);

  // Claim once the account's profile exists — a brand-new account's profile is saved just after
  // sign-in, and claiming before it would be refused — or when a link arrives while signed in.
  const profileId = useUserStore((s) => s.profile?.id);
  useEffect(() => {
    if (!userId || profileId !== userId) return;
    useInviteStore.getState().claimPending();
  }, [userId, profileId]);

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
