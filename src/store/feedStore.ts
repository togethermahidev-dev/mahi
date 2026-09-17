import { create } from 'zustand';
import { getFeed, type FeedPost, type FeedCursor } from '@/api';

const PAGE_SIZE = 20;

export type PendingPost = FeedPost & { isPending: true };

interface FeedState {
  posts: FeedPost[];
  pending: PendingPost[];
  cursor: FeedCursor | undefined;
  hasMore: boolean;
  isSyncing: boolean;
  /** True until the first page of this session has loaded. */
  loaded: boolean;
  error: Error | null;
  /** Friends' posts are hidden until the user posts (server decides). */
  locked: boolean;
  unlockedUntil: string | null;
  serverOffsetMs: number;

  sync: (force?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  addPending: (post: PendingPost) => void;
  confirmPending: (tempId: string, real: FeedPost) => void;
  removePending: (tempId: string) => void;
  patchPost: (id: string, partial: Partial<FeedPost>) => void;
  reset: () => void;
}

// Bumped by every sync/reset; a response from an older request is dropped, so a slow first
// page can never overwrite a newer one (e.g. the unlock right after posting).
let generation = 0;

const initial = {
  posts: [] as FeedPost[],
  pending: [] as PendingPost[],
  cursor: undefined,
  hasMore: true,
  isSyncing: false,
  loaded: false,
  error: null,
  locked: false,
  unlockedUntil: null,
  serverOffsetMs: 0,
};

const cursorOf = (posts: FeedPost[]): FeedCursor | undefined =>
  posts.length ? { ts: posts[posts.length - 1].created_at, id: posts[posts.length - 1].id } : undefined;

export const useFeedStore = create<FeedState>((set, get) => ({
  ...initial,

  sync: async (force = false) => {
    if (!force && (get().isSyncing || get().loaded)) return;
    const gen = ++generation;
    set({ isSyncing: true, error: null });

    const { data, error } = await getFeed(PAGE_SIZE);
    if (gen !== generation) return;
    if (data) {
      set({
        posts: data.posts,
        cursor: cursorOf(data.posts),
        hasMore: data.posts.length === PAGE_SIZE,
        locked: data.locked,
        unlockedUntil: data.unlockedUntil,
        serverOffsetMs: data.serverOffsetMs,
        loaded: true,
      });
    } else if (error) {
      set({ error });
    }
    set({ isSyncing: false });
  },

  loadMore: async () => {
    const { isSyncing, hasMore, cursor } = get();
    if (isSyncing || !hasMore || !cursor) return;
    const gen = generation;
    set({ isSyncing: true, error: null });

    const { data, error } = await getFeed(PAGE_SIZE, cursor);
    if (gen !== generation) return;
    if (data) {
      const seen = new Set(get().posts.map((p) => p.id));
      const fresh = data.posts.filter((p) => !seen.has(p.id));
      set({
        posts: [...get().posts, ...fresh],
        cursor: cursorOf(data.posts) ?? cursor,
        hasMore: data.posts.length === PAGE_SIZE,
      });
    } else if (error) {
      set({ error });
    }
    set({ isSyncing: false });
  },

  addPending: (post) => set((state) => ({ pending: [post, ...state.pending] })),

  confirmPending: (tempId, real) =>
    set((state) => ({
      pending: state.pending.filter((p) => p.id !== tempId),
      posts: [real, ...state.posts.filter((p) => p.id !== real.id)],
    })),

  removePending: (tempId) =>
    set((state) => ({ pending: state.pending.filter((p) => p.id !== tempId) })),

  patchPost: (id, partial) =>
    set((state) => ({
      posts: state.posts.map((p) => (p.id === id ? { ...p, ...partial } : p)),
    })),

  reset: () => {
    generation++;
    set(initial);
  },
}));
