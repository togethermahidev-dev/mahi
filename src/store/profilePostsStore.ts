import { create } from 'zustand';
import { getUserPosts, type ProfilePostCursor } from '@/api';
import type { Database } from '@/types';

type PostRow = Database['public']['Tables']['posts']['Row'];

const PAGE_SIZE = 30;

interface ProfilePostsState {
  posts:     PostRow[];
  cursor:    ProfilePostCursor | undefined;
  hasMore:   boolean;
  isSyncing: boolean;

  sync:     (userId: string, force?: boolean) => Promise<void>;
  loadMore: (userId: string) => Promise<void>;
  addPost:  (post: PostRow) => void;
  reset:    () => void;
}

export const useProfilePostsStore = create<ProfilePostsState>((set, get) => ({
  posts:     [],
  cursor:    undefined,
  hasMore:   true,
  isSyncing: false,

  sync: async (userId, force = false) => {
    const { isSyncing, posts } = get();
    if (isSyncing || (!force && posts.length > 0)) return;
    set({ isSyncing: true });

    const { data, error } = await getUserPosts(userId, PAGE_SIZE);
    if (!error && data) {
      const cursor: ProfilePostCursor | undefined = data.length
        ? { ts: data.at(-1)!.created_at, id: data.at(-1)!.id }
        : undefined;
      set({ posts: data, cursor, hasMore: data.length === PAGE_SIZE });
    }
    set({ isSyncing: false });
  },

  loadMore: async (userId) => {
    const { isSyncing, hasMore, cursor, posts } = get();
    if (isSyncing || !hasMore) return;
    set({ isSyncing: true });

    const { data, error } = await getUserPosts(userId, PAGE_SIZE, cursor);
    if (!error && data) {
      set({
        posts:   [...posts, ...data],
        cursor:  data.length
          ? { ts: data.at(-1)!.created_at, id: data.at(-1)!.id }
          : cursor,
        hasMore: data.length === PAGE_SIZE,
      });
    }
    set({ isSyncing: false });
  },

  addPost: (post) => set((s) => ({ posts: [post, ...s.posts] })),

  reset: () => set({ posts: [], cursor: undefined, hasMore: true, isSyncing: false }),
}));
