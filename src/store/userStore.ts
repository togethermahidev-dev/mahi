import { create } from 'zustand';

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
}

interface UserState {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  reset: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  reset: () => set({ profile: null }),
}));
