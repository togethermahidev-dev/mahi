import { create } from 'zustand';
import { getProfile, setAccountControls } from '@/api';
import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import type { AccountControls, PostsVisibility, TagPermission } from '@/lib/accountControls';

interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  fitness_goals: string[] | null;
  avatar_url: string | null;
  /** Mahi points: +1 per post that answers a tag, back to 0 on a missed tag. */
  streak_current: number;
  /** Best Mahi points, never lowered. */
  streak_highest: number;
  /** Your first workout is posted; permanent, even after deleting every post. */
  has_posted_before?: boolean;
  /** Settings → Controls (20261008170000_private_accounts); missing from an older server. */
  is_private?: boolean;
  posts_visibility?: PostsVisibility;
  tag_permission?: TagPermission;
  /** Null until the public / private choice after sign-up is made. */
  privacy_chosen_at?: string | null;
}

interface UserState {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  /** Re-read the signed-in profile from the server (e.g. points after a missed tag). */
  refresh: (userId: string) => Promise<void>;
  /**
   * Change any of my Controls: shown at once, then the server's saved answer (private +
   * Everyone is stored as Followers); a refusal puts the old choice back. `acceptedRequests`:
   * how many waiting follow requests going public accepted.
   */
  saveControls: (
    patch: Partial<AccountControls>
  ) => Promise<{ error: Error | null; acceptedRequests?: number }>;
  reset: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  refresh: async (userId) => {
    const { data, error } = await getProfile(userId);
    if (error) {
      console.log('[userStore] refresh failed', error.message);
      reportError(error, { flow: 'profile', action: 'refresh', extra: { userId } });
      return;
    }
    if (data && get().profile?.id === userId) set({ profile: data });
  },
  saveControls: async (patch) => {
    const before = get().profile;
    if (!before) return { error: new Error('No profile loaded') };
    set({ profile: { ...before, ...patch } });

    const { data, error } = await setAccountControls(patch);
    const current = get().profile;
    if (error || !data) {
      const saveError = error ?? new Error('set_account_controls returned no answer');
      console.log('[userStore] saveControls failed |', saveError.message);
      if (current?.id === before.id) {
        set({
          profile: {
            ...current,
            is_private: before.is_private,
            posts_visibility: before.posts_visibility,
            tag_permission: before.tag_permission,
            privacy_chosen_at: before.privacy_chosen_at,
          },
        });
      }
      return { error: saveError };
    }

    const saved = {
      is_private: data.is_private,
      posts_visibility: data.posts_visibility,
      tag_permission: data.tag_permission,
    };
    track('account_controls_changed', saved);
    if (current?.id === before.id) {
      set({
        profile: {
          ...current,
          ...saved,
          // The server sets it on the first save; the exact time doesn't matter here.
          privacy_chosen_at: current.privacy_chosen_at ?? new Date().toISOString(),
        },
      });
    }
    return { error: null, acceptedRequests: data.accepted_requests };
  },
  reset: () => set({ profile: null }),
}));
