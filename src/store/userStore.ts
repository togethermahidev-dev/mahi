import { create } from 'zustand';

interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;  // ISO date 'YYYY-MM-DD'
  contact_number: string | null;
  fitness_goals: string[] | null;
  fitness_routine: string | null;
  avatar_url: string | null;
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
