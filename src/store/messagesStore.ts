import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  getInbox,
  getRequests,
  acceptRequest,
  deleteConversation,
  type ConversationPreview,
  type MsgRow,
} from '@/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Channel registry — outside store state so channel changes don't trigger renders
const msgChannels = new Map<string, RealtimeChannel>();

interface MessagesState {
  inbox:     ConversationPreview[];
  requests:  ConversationPreview[];
  isSyncing: boolean;

  sync:   (userId: string) => Promise<void>;
  accept: (conversationId: string) => Promise<void>;
  /** Optimistic delete from requests (DENY flow). */
  deny:   (conversationId: string) => Promise<void>;
  /** Update the last_message preview for a conversation — called from real-time handlers. */
  patchConversationLastMessage: (
    conversationId: string,
    msg: Pick<MsgRow, 'id' | 'content' | 'sender_id' | 'created_at'>,
  ) => void;
  /** Subscribe to new conversations/requests arriving in real-time. */
  subscribeToInbox:   (userId: string) => void;
  /** Tear down the inbox subscription. */
  unsubscribeFromInbox: (userId: string) => void;
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

  deny: async (conversationId: string) => {
    const { requests } = get();
    const denied = requests.find((c) => c.id === conversationId);

    // Optimistic: remove from requests immediately
    if (denied) {
      set((state) => ({
        requests: state.requests.filter((c) => c.id !== conversationId),
      }));
    }

    const { error } = await deleteConversation(conversationId);
    if (error && denied) {
      // Rollback on failure
      set((state) => ({ requests: [...state.requests, denied] }));
    }
  },

  patchConversationLastMessage: (conversationId, msg) => {
    set((state) => ({
      inbox: state.inbox.map((c) =>
        c.id === conversationId
          ? { ...c, last_message: msg, updated_at: msg.created_at }
          : c,
      ),
      requests: state.requests.map((c) =>
        c.id === conversationId
          ? { ...c, last_message: msg, updated_at: msg.created_at }
          : c,
      ),
    }));
  },

  subscribeToInbox: (userId: string) => {
    // Use two separate channels — one per participant column — so each channel
    // carries a server-side filter. This avoids transmitting all conversations rows
    // to all clients (postgres_changes bypasses RLS at the WAL level).
    const keyP1 = `inbox_p1:${userId}`;
    const keyP2 = `inbox_p2:${userId}`;
    if (msgChannels.has(keyP1)) return; // already subscribed

    type ConvRow = { id: string; status: string; participant_one: string; participant_two: string };

    const handleInsert = (_payload: { new: unknown }) => {
      // New conversation where this user is a participant — re-sync for full preview
      get().sync(userId);
    };

    const handleUpdate = (payload: { new: unknown }) => {
      const updated = payload.new as ConvRow;
      if (updated.status === 'active') {
        const conv = get().requests.find((c) => c.id === updated.id);
        if (conv) {
          set((state) => ({
            requests: state.requests.filter((c) => c.id !== updated.id),
            inbox:    [{ ...conv, status: 'active' as const }, ...state.inbox],
          }));
        }
      }
    };

    // Channel 1: this user is participant_one
    const ch1 = supabase
      .channel(keyP1)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversations',
        filter: `participant_one=eq.${userId}`,
      }, handleInsert)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `participant_one=eq.${userId}`,
      }, handleUpdate)
      .subscribe();

    // Channel 2: this user is participant_two
    const ch2 = supabase
      .channel(keyP2)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversations',
        filter: `participant_two=eq.${userId}`,
      }, handleInsert)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `participant_two=eq.${userId}`,
      }, handleUpdate)
      .subscribe();

    msgChannels.set(keyP1, ch1);
    msgChannels.set(keyP2, ch2);
  },

  unsubscribeFromInbox: (userId: string) => {
    [`inbox_p1:${userId}`, `inbox_p2:${userId}`].forEach((key) => {
      const ch = msgChannels.get(key);
      if (ch) { supabase.removeChannel(ch); msgChannels.delete(key); }
    });
  },

  reset: () => {
    // Tear down all active channels
    msgChannels.forEach((ch) => supabase.removeChannel(ch));
    msgChannels.clear();
    set({ inbox: [], requests: [], isSyncing: false });
  },
}));
