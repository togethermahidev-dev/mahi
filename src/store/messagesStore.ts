import { create } from 'zustand';
import { getInbox, getRequests, acceptRequest, type ConversationPreview } from '@/api';

interface MessagesState {
  inbox:     ConversationPreview[];
  requests:  ConversationPreview[];
  isSyncing: boolean;

  sync:   (userId: string) => Promise<void>;
  accept: (conversationId: string) => Promise<void>;
  reset:  () => void;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  inbox:     [],
  requests:  [],
  isSyncing: false,

  sync: async (userId: string) => {
    if (get().isSyncing) return;
    set({ isSyncing: true });

    const [inboxResult, requestsResult] = await Promise.all([
      getInbox(userId),
      getRequests(userId),
    ]);

    if (inboxResult.data)    set({ inbox:    inboxResult.data });
    if (requestsResult.data) set({ requests: requestsResult.data });
    set({ isSyncing: false });
  },

  accept: async (conversationId: string) => {
    const { requests } = get();
    const accepted = requests.find((c) => c.id === conversationId);

    // Optimistic: move request → inbox immediately
    if (accepted) {
      set((state) => ({
        requests: state.requests.filter((c) => c.id !== conversationId),
        inbox:    [{ ...accepted, status: 'active' as const }, ...state.inbox],
      }));
    }

    const { error } = await acceptRequest(conversationId);
    if (error && accepted) {
      // Rollback on failure
      set((state) => ({
        inbox:    state.inbox.filter((c) => c.id !== conversationId),
        requests: [...state.requests, accepted],
      }));
    }
  },

  reset: () => set({ inbox: [], requests: [], isSyncing: false }),
}));
