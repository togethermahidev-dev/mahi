import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { claimOnReturn, parseInviteLink } from '@/lib/inviteLink';
import { clipHandoverDecision, readClipHandover } from '@/lib/clipHandover';
import { hasClipHandover, takeClipHandover } from '@/lib/clipHandoverModule';
import { track } from '@/lib/analytics';
import { env } from '@/lib/env';
import { posthog } from '@/lib/posthog';
import { reportError } from '@/lib/sentry';
import { useAuthStore, useInviteStore, useUserStore } from '@/store';

/**
 * Wires invite links into the app: one that opened it cold, one that arrived while it was
 * running, and the claim once somebody is signed in and has said yes to it. Mounted once, at the
 * top.
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

  // An invite the App Clip handed over (build 13+, switch `app-clip`; see lib/clipHandover.ts).
  // Waits for PostHog's answer so an off switch is never missed on a fresh install; read once and
  // deleted either way. A link Mahi was opened with wins over it.
  useEffect(() => {
    if (!hasClipHandover()) return;
    let settled = false;
    const settle = () => {
      if (settled) return;
      const decision = clipHandoverDecision(
        posthog.isFeatureEnabled('app-clip'),
        env.posthogKey != null
      );
      if (decision === 'wait') return;
      settled = true;
      const raw = takeClipHandover();
      if (decision !== 'take') return;
      const token = readClipHandover(raw, Date.now());
      if (!token || useInviteStore.getState().pendingToken) return;
      void useInviteStore.getState().setPending(token);
      track('invite_clip_handover', { signed_in: !!useAuthStore.getState().user });
    };
    settle();
    if (settled) return;
    const unsubscribe = posthog.onFeatureFlags(settle);
    return () => unsubscribe();
  }, []);

  // Claim once the account's profile exists — a brand-new account's profile is saved just after
  // sign-in, and claiming before it would be refused — and only once the person has said yes:
  // the sign-up card showed the invite, or Accept on InviteConfirmSheet (a link that arrives while
  // signed in is asked about there first; claimPending does nothing without that yes).
  const profileId = useUserStore((s) => s.profile?.id);
  const confirmedToken = useInviteStore((s) => s.confirmedToken);
  useEffect(() => {
    if (!userId || profileId !== userId || !confirmedToken) return;
    void useInviteStore.getState().claimPending();
  }, [userId, profileId, confirmedToken]);

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
