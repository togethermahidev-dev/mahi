import { create } from 'zustand';
import { getFeedPosts, type FeedPost, type FeedCursor } from '@/api';

const PAGE_SIZE = 20;

export type PendingPost = FeedPost & { isPending: true };

interface FeedState {
  posts: FeedPost[];
  pending: PendingPost[];
  cursor: FeedCursor | undefined;
  hasMore: boolean;
  isSyncing: boolean;
  error: Error | null;

  sync: (force?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  addPending: (post: PendingPost) => void;
  confirmPending: (tempId: string, real: FeedPost) => void;
  removePending: (tempId: string) => void;
  patchPost: (id: string, partial: Partial<FeedPost>) => void;
  reset: () => void;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  pending: [],
  cursor: undefined,
  hasMore: true,
  isSyncing: false,
  error: null,

  sync: async (force = false) => {
    const { isSyncing, posts } = get();
    if (isSyncing) return;
    if (!force && posts.length > 0) return; // already populated, skip
    set({ isSyncing: true, error: null });

    const { data, error } = await getFeedPosts(PAGE_SIZE);
    if (!error && data) {
      const cursor: FeedCursor | undefined = data.length
        ? { ts: data[data.length - 1].created_at, id: data[data.length - 1].id }
        : undefined;
      set({ posts: data, cursor, hasMore: data.length === PAGE_SIZE });
    } else if (error) {
      set({ error });
    }
    set({ isSyncing: false });
  },

  loadMore: async () => {
    const { isSyncing, hasMore, cursor, posts } = get();
    if (isSyncing || !hasMore) return;
    set({ isSyncing: true, error: null });

    const { data, error } = await getFeedPosts(PAGE_SIZE, cursor);
    if (!error && data) {
      const newCursor: FeedCursor | undefined = data.length
        ? { ts: data[data.length - 1].created_at, id: data[data.length - 1].id }
        : cursor;
      set({
        posts: [...posts, ...data],
        cursor: newCursor,
        hasMore: data.length === PAGE_SIZE,
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
      posts: [real, ...state.posts],
    })),

  removePending: (tempId) =>
    set((state) => ({ pending: state.pending.filter((p) => p.id !== tempId) })),

  patchPost: (id, partial) =>
    set((state) => ({
      posts: state.posts.map((p) => (p.id === id ? { ...p, ...partial } : p)),
    })),

  reset: () =>
    set({
      posts: [],
      pending: [],
      cursor: undefined,
      hasMore: true,
      isSyncing: false,
      error: null,
    }),
}));
