import { create } from 'zustand';
import { getOpenTags, getTagRules, getTaggableFriends, type OpenTag } from '@/api';

interface TagState {
  /** Tags waiting for this user's post. In memory only — they expire. */
  openTags: OpenTag[];
  /** server clock − device clock, from the last read. */
  serverOffsetMs: number;
  /** Tags the next post must carry (the server enforces the same rule). */
  requiredTags: number;
  maxTags: number;
  /** Flag friends nobody has tagged for this many days (server setting). */
  nudgeDays: number;
  isSyncing: boolean;
  syncOpenTags: () => Promise<void>;
  loadRequirement: () => Promise<void>;
  reset: () => void;
}

const initial = {
  openTags: [],
  serverOffsetMs: 0,
  requiredTags: 0,
  maxTags: 3,
  nudgeDays: 7,
  isSyncing: false,
};

export const useTagStore = create<TagState>((set, get) => ({
  ...initial,

  syncOpenTags: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true });
    const requestedAt = Date.now();
    const { data, error } = await getOpenTags();
    if (error) {
      console.log('[tagStore] syncOpenTags failed', error.message);
    } else if (data) {
      const serverNow = data[0]?.server_now;
      set({
        openTags: data,
        serverOffsetMs: serverNow ? new Date(serverNow).getTime() - requestedAt : 0,
      });
    }
    set({ isSyncing: false });
  },

  loadRequirement: async () => {
    const [rules, friends] = await Promise.all([getTagRules(), getTaggableFriends('', 100)]);
    if (rules.error || friends.error || !rules.data || !friends.data) {
      console.log(
        '[tagStore] loadRequirement failed',
        rules.error?.message ?? friends.error?.message
      );
      return;
    }
    const available = friends.data.filter((f) => !f.has_open_tag).length;
    set({
      maxTags: Math.max(rules.data.tagCount, 1),
      nudgeDays: rules.data.nudgeDays,
      requiredTags: rules.data.tagsRequired ? Math.min(rules.data.tagCount, available) : 0,
    });
  },

  reset: () => set(initial),
}));
