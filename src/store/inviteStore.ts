import { create } from 'zustand';
import { claimInvite, getInvitePreview, type InvitePreview } from '@/api';
import { useTagStore } from './tagStore';
import { useToastStore } from './toastStore';
import { track } from '@/lib/analytics';

interface InviteState {
  /**
   * The token or code Mahi was opened with, or one typed on the sign-up screen.
   * In memory only: an invite expires, so it is never written to the phone.
   */
  pendingToken: string | null;
  /** Who sent it, for the sign-up screen. Null until the preview comes back. */
  preview: InvitePreview | null;
  isClaiming: boolean;

  /** Hold a token and look up who sent it. Passing null forgets the pending one. */
  setPending: (token: string | null) => Promise<void>;
  /**
   * Claim the pending invite. Does nothing without one. The server refuses accounts older
   * than a day, so this is quietly a no-op for everyone but someone who just joined.
   */
  claimPending: () => Promise<boolean>;
  reset: () => void;
}

const initial = { pendingToken: null, preview: null, isClaiming: false };

export const useInviteStore = create<InviteState>((set, get) => ({
  ...initial,

  setPending: async (token) => {
    if (!token) {
      set({ pendingToken: null, preview: null });
      return;
    }
    set({ pendingToken: token, preview: null });
    const { data } = await getInvitePreview(token);
    // A second link may have arrived while this was in flight.
    if (get().pendingToken === token) set({ preview: data });
  },

  claimPending: async () => {
    const token = get().pendingToken;
    if (!token || get().isClaiming) return false;
    set({ isClaiming: true });

    const { data, error } = await claimInvite(token);
    set({ isClaiming: false });
    if (error || !data) {
      // An invite that can't be claimed (used, expired, or an older account) is not an
      // error the user needs to see — they carry on signing in as normal.
      set({ pendingToken: null, preview: null });
      return false;
    }

    set({ pendingToken: null, preview: null });
    track('invite_claimed', { inviter_id: data.inviter.id });
    // The tag is live from this moment, so the camera's countdown should show it.
    useTagStore.getState().syncOpenTags();
    useToastStore
      .getState()
      .show(`@${data.inviter.username} tagged you — you have 48 hours to post`, 4000);
    return true;
  },

  reset: () => set(initial),
}));
