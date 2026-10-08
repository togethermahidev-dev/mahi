import { create } from 'zustand';
import { claimInvite, getInvitePreview, type InvitePreview } from '@/api';
import { useTagStore } from './tagStore';
import { useToastStore } from './toastStore';
import { track } from '@/lib/analytics';
import { claimedText, claimFailText } from '@/lib/inviteLink';
import { reportError, Sentry } from '@/lib/sentry';

interface InviteState {
  /**
   * The token or code Mahi was opened with, or one typed on the sign-up screen.
   * In memory only: an invite expires, so it is never written to the phone.
   */
  pendingToken: string | null;
  /** Who sent it, for the sign-up screen. Null until the preview comes back. */
  preview: InvitePreview | null;
  /** The preview lookup for the pending token has come back (null preview = not a real invite). */
  previewChecked: boolean;
  /**
   * The invite the person has said yes to: the sign-up card showed it before the account was made,
   * or they pressed Accept on the sheet a signed-in person sees. Nothing is claimed without it,
   * because claiming makes both people follow each other (and may start a tag).
   */
  confirmedToken: string | null;
  isClaiming: boolean;

  /** Hold a token and look up who sent it. Passing null forgets the pending one. */
  setPending: (token: string | null) => Promise<void>;
  /** The person has said yes to this invite (the sign-up card showed it). */
  confirm: (token: string) => void;
  /** Accept on the sheet: say yes to the pending invite and claim it. */
  accept: () => Promise<boolean>;
  /** Not now on the sheet: let the invite go. Nothing is claimed. */
  decline: () => void;
  /**
   * Claim the pending invite. Does nothing without one, or until the person has said yes to it
   * (`confirmedToken`). The server refuses accounts older
   * than a day; then, as for a used or expired invite, a note says why and the invite goes.
   * Any other failure (no connection) keeps it, with Try again.
   */
  claimPending: () => Promise<boolean>;
  reset: () => void;
}

/** What claim_invite says when it refuses an invite for good (anything else may work next time). */
const SERVER_REFUSALS = ['new accounts', 'been used', 'expired', 'your own', 'not valid'];

const initial = {
  pendingToken: null,
  preview: null,
  previewChecked: false,
  confirmedToken: null,
  isClaiming: false,
};

/** Forget the invite and any yes to it. */
const cleared = { pendingToken: null, preview: null, previewChecked: false, confirmedToken: null };

export const useInviteStore = create<InviteState>((set, get) => ({
  ...initial,

  setPending: async (token) => {
    if (!token) {
      set(cleared);
      return;
    }
    set({ pendingToken: token, preview: null, previewChecked: false });
    const { data, error } = await getInvitePreview(token);
    if (error) {
      reportError(error, {
        flow: 'invites',
        action: 'loadPreview',
        extra: { rpc: 'get_invite_preview' },
      });
    }
    // A second link may have arrived while this was in flight.
    if (get().pendingToken === token) set({ preview: data, previewChecked: true });
  },

  confirm: (token) => set({ confirmedToken: token }),

  accept: async () => {
    const token = get().pendingToken;
    if (!token) return false;
    set({ confirmedToken: token });
    return get().claimPending();
  },

  decline: () => set(cleared),

  claimPending: async () => {
    const token = get().pendingToken;
    if (!token || get().confirmedToken !== token || get().isClaiming) return false;
    set({ isClaiming: true });

    const inviter = get().preview?.username ?? null;
    const { data, error } = await claimInvite(token);
    set({ isClaiming: false });
    if (error || !data) {
      const message = error?.message ?? '';
      if (!SERVER_REFUSALS.some((r) => message.includes(r))) {
        reportError(error ?? new Error('claim_invite returned no data'), {
          flow: 'invites',
          action: 'claimInvite',
          extra: { rpc: 'claim_invite' },
        });
        // No connection (or no answer): keep the invite, so Try again has something to try with.
        // Signing in again tries again too.
        useToastStore
          .getState()
          .show(
            `Couldn’t connect you with ${inviter ? `@${inviter}` : 'your friend'}. Try again.`,
            {
              action: { label: 'Try again', onPress: () => void get().claimPending() },
            }
          );
        return false;
      }
      // The server said no (an older account, used, ended, a mistyped code): say why instead of
      // nothing at all, and let the invite go. Signing in carries on as normal.
      Sentry.addBreadcrumb({ category: 'invites', message: `claim_invite refused: ${message}` });
      set(cleared);
      useToastStore.getState().show(claimFailText(message, inviter));
      return false;
    }

    set(cleared);
    track('invite_claimed', { inviter_id: data.inviter.id });
    // A tag that started is live from this moment, so the camera's countdown should show it.
    useTagStore.getState().syncOpenTags();
    useToastStore.getState().show(
      claimedText({
        inviter: data.inviter.username,
        expiresAt: data.expires_at,
        tag: data.tag,
        followStatus: data.follow_status,
      })
    );
    return true;
  },

  reset: () => set(initial),
}));
