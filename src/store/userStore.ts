import { create } from 'zustand';
import { getProfile } from '@/api';

interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null; // ISO date 'YYYY-MM-DD'
  contact_number: string | null;
  fitness_goals: string[] | null;
  fitness_routine: string | null;
  avatar_url: string | null;
  streak_current: number;
  streak_highest: number;
  streak_lowest: number | null;
  streak_last_upload_date: string | null; // ISO date 'YYYY-MM-DD'
  /** Mahi points (server-counted). */
  points?: number;
}

interface UserState {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  /** Re-read the signed-in profile from the server (e.g. points after answering tags). */
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
      return;
    }
    if (data && get().profile?.id === userId) set({ profile: data });
  },
  reset: () => set({ profile: null }),
}));
