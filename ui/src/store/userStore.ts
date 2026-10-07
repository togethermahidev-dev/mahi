import { create } from 'zustand';
import { getProfile } from '@/api';
import { reportError } from '@/lib/sentry';

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
  /** Your free first post is used; permanent, even after deleting every post. */
  has_posted_before?: boolean;
}

interface UserState {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  /** Re-read the signed-in profile from the server (e.g. points after a missed tag). */
  refresh: (userId: string) => Promise<void>;
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
  reset: () => set({ profile: null }),
}));
