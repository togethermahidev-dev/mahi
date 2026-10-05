import { create } from 'zustand';
import { claimInvite, getInvitePreview, type InvitePreview } from '@/api';
import { useTagStore } from './tagStore';
import { useToastStore } from './toastStore';
import { track } from '@/lib/analytics';
import { claimedText, claimFailText } from '@/lib/inviteLink';

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
  isClaiming: boolean;

  /** Hold a token and look up who sent it. Passing null forgets the pending one. */
  setPending: (token: string | null) => Promise<void>;
  /**
   * Claim the pending invite. Does nothing without one. The server refuses accounts older
   * than a day; then, as for a used or expired invite, a note says why.
   */
  claimPending: () => Promise<boolean>;
  reset: () => void;
}

const initial = { pendingToken: null, preview: null, previewChecked: false, isClaiming: false };

export const useInviteStore = create<InviteState>((set, get) => ({
  ...initial,

  setPending: async (token) => {
    if (!token) {
      set({ pendingToken: null, preview: null, previewChecked: false });
      return;
    }
    set({ pendingToken: token, preview: null, previewChecked: false });
    const { data } = await getInvitePreview(token);
    // A second link may have arrived while this was in flight.
    if (get().pendingToken === token) set({ preview: data, previewChecked: true });
  },

  claimPending: async () => {
    const token = get().pendingToken;
    if (!token || get().isClaiming) return false;
    set({ isClaiming: true });

    const inviter = get().preview?.username ?? null;
    const { data, error } = await claimInvite(token);
    set({ isClaiming: false });
    if (error || !data) {
      // They opened a link or typed a code, so say why it didn't work (an older account, used,
      // expired, a mistyped code) instead of nothing at all. Signing in carries on as normal.
      set({ pendingToken: null, preview: null, previewChecked: false });
      useToastStore.getState().show(claimFailText(error?.message ?? '', inviter));
      return false;
    }

    set({ pendingToken: null, preview: null, previewChecked: false });
    track('invite_claimed', { inviter_id: data.inviter.id });
    // A tag that started is live from this moment, so the camera's countdown should show it.
    useTagStore.getState().syncOpenTags();
    useToastStore
      .getState()
      .show(claimedText({ inviter: data.inviter.username, expiresAt: data.expires_at }));
    return true;
  },

  reset: () => set(initial),
}));
