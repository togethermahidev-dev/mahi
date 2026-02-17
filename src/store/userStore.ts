import { create } from 'zustand';

interface UserProfile {
  id: string;
  display_name: string | null;
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
