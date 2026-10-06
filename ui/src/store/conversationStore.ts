import { create } from 'zustand';
import { AppState, type NativeEventSubscription } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import {
  getMessages,
  sendMessage,
  editMessage,
  unsendMessage,
  startConversation,
  markConversationRead,
  MESSAGE_PAGE,
  type Message,
} from '@/api';
import { useMessagesStore } from './messagesStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Channel registry — outside store state so channel changes don't trigger renders.
const convoChannels = new Map<string, RealtimeChannel>();
// Conversations whose channel has connected at least once. A later connect is a reconnect,
// and a reconnect may have missed messages, so the newest page is re-read.
const everConnected = new Set<string>();
let appStateSub: NativeEventSubscription | null = null;

/** One conversation, oldest message first. Nothing here is written to the phone. */
export interface Thread {
  messages: Message[];
  /** First page still loading. */
  isLoading: boolean;
  isLoadingOlder: boolean;
  /** There are older messages before the oldest one loaded. */
  hasMore: boolean;
}

const EMPTY: Thread = { messages: [], isLoading: true, isLoadingOlder: false, hasMore: false };

/** Server rows win over the optimistic row that carries the same client_id. */
function merge(existing: Message[], incoming: Message[]): Message[] {
  const byKey = new Map<string, Message>();
  for (const m of [...existing, ...incoming]) byKey.set(m.client_id ?? m.id, m);
  return [...byKey.values()].sort((a, b) =>
    a.created_at === b.created_at
      ? a.id.localeCompare(b.id)
      : a.created_at.localeCompare(b.created_at)
  );
}

interface ConversationState {
  threads: Record<string, Thread>;

  /** Load the newest page and start listening. Safe to call again. */
  open: (conversationId: string) => Promise<void>;
  /** Stop listening. Messages stay in memory until reset(). */
  close: (conversationId: string) => void;
  /** The page before the oldest message loaded. */
  loadOlder: (conversationId: string) => Promise<void>;
  /** Re-read the newest page — after a reconnect, or when the app comes back. */
  refreshNewest: (conversationId: string) => Promise<void>;
  /** Shows immediately, then the server's row replaces it. False = it didn't send. */
  send: (conversationId: string, userId: string, content: string) => Promise<boolean>;
  /** Edit your own message. Shows at once; the old words come back if the server says no. */
  edit: (conversationId: string, messageId: string, content: string) => Promise<boolean>;
  /** Unsend your own message. Gone at once; back if the server says no. */
  unsend: (conversationId: string, messageId: string) => Promise<boolean>;
  /** The first message to someone: the server makes the conversation. Null = it didn't send. */
  start: (
    otherUserId: string,
    userId: string,
    content: string
  ) => Promise<{ conversationId: string; status: string } | null>;
  markRead: (conversationId: string) => Promise<void>;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  threads: {},

  refreshNewest: async (conversationId) => {
    const { data } = await getMessages(conversationId);
    if (!data) {
      set((s) => ({
        threads: {
          ...s.threads,
          [conversationId]: { ...(s.threads[conversationId] ?? EMPTY), isLoading: false },
        },
      }));
      return;
    }
    set((s) => {
      const prev = s.threads[conversationId] ?? EMPTY;
      return {
        threads: {
          ...s.threads,
          [conversationId]: {
            messages: merge(prev.messages, data),
            isLoading: false,
            isLoadingOlder: false,
            // Only the first page can tell us this; later pages keep what loadOlder found.
            hasMore: prev.messages.length === 0 ? data.length === MESSAGE_PAGE : prev.hasMore,
          },
        },
      };
    });
  },

  open: async (conversationId) => {
    if (!get().threads[conversationId]) {
      set((s) => ({ threads: { ...s.threads, [conversationId]: EMPTY } }));
    }

    if (!convoChannels.has(conversationId)) {
      const channel = supabase
        .channel(`convo:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const incoming = payload.new as Message;
            set((s) => {
              const prev = s.threads[conversationId] ?? EMPTY;
              return {
                threads: {
                  ...s.threads,
                  [conversationId]: { ...prev, messages: merge(prev.messages, [incoming]) },
                },
              };
            });
            useMessagesStore.getState().patchConversationLastMessage(conversationId, incoming);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            // An edit replaces the words; an unsend takes the message away.
            const changed = payload.new as Message;
            set((s) => {
              const prev = s.threads[conversationId] ?? EMPTY;
              const messages = changed.unsent_at
                ? prev.messages.filter((m) => m.id !== changed.id)
                : prev.messages.map((m) => (m.id === changed.id ? { ...m, ...changed } : m));
              return { threads: { ...s.threads, [conversationId]: { ...prev, messages } } };
            });
          }
        )
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          // A reconnect may have missed messages while it was down.
          if (everConnected.has(conversationId)) get().refreshNewest(conversationId);
          everConnected.add(conversationId);
        });
      convoChannels.set(conversationId, channel);
    }

    if (!appStateSub) {
      appStateSub = AppState.addEventListener('change', (next) => {
        if (next !== 'active') return;
        for (const id of convoChannels.keys()) get().refreshNewest(id);
      });
    }

    await get().refreshNewest(conversationId);
  },

  close: (conversationId) => {
    const ch = convoChannels.get(conversationId);
    if (ch) {
      supabase.removeChannel(ch);
      convoChannels.delete(conversationId);
      everConnected.delete(conversationId);
    }
    if (convoChannels.size === 0 && appStateSub) {
      appStateSub.remove();
      appStateSub = null;
    }
  },

  loadOlder: async (conversationId) => {
    const thread = get().threads[conversationId];
    if (!thread || !thread.hasMore || thread.isLoadingOlder || thread.isLoading) return;
    const oldest = thread.messages[0];
    if (!oldest) return;

    set((s) => ({
      threads: { ...s.threads, [conversationId]: { ...thread, isLoadingOlder: true } },
    }));

    const { data } = await getMessages(conversationId, {
      createdAt: oldest.created_at,
      id: oldest.id,
    });

    set((s) => {
      const prev = s.threads[conversationId] ?? EMPTY;
      return {
        threads: {
          ...s.threads,
          [conversationId]: {
            ...prev,
            messages: data ? merge(prev.messages, data) : prev.messages,
            isLoadingOlder: false,
            hasMore: data ? data.length === MESSAGE_PAGE : prev.hasMore,
          },
        },
      };
    });
  },

  send: async (conversationId, userId, content) => {
    const text = content.trim();
    if (!text) return false;

    // The client id is what makes a retry safe: the server hands back the same message.
    const clientId = randomUUID();
    const optimistic: Message = {
      id: `temp_${clientId}`,
      conversation_id: conversationId,
      sender_id: userId,
      content: text,
      client_id: clientId,
      created_at: new Date().toISOString(),
    };
    set((s) => {
      const prev = s.threads[conversationId] ?? EMPTY;
      return {
        threads: {
          ...s.threads,
          [conversationId]: { ...prev, messages: [...prev.messages, optimistic] },
        },
      };
    });

    const { data, error } = await sendMessage(conversationId, clientId, text);

    if (error || !data) {
      set((s) => {
        const prev = s.threads[conversationId] ?? EMPTY;
        return {
          threads: {
            ...s.threads,
            [conversationId]: {
              ...prev,
              messages: prev.messages.filter((m) => m.client_id !== clientId),
            },
          },
        };
      });
      return false;
    }

    set((s) => {
      const prev = s.threads[conversationId] ?? EMPTY;
      return {
        threads: {
          ...s.threads,
          [conversationId]: { ...prev, messages: merge(prev.messages, [data]) },
        },
      };
    });
    useMessagesStore.getState().patchConversationLastMessage(conversationId, data);
    return true;
  },

  edit: async (conversationId, messageId, content) => {
    const text = content.trim();
    const before = get().threads[conversationId]?.messages.find((m) => m.id === messageId);
    if (!text || !before) return false;
    const put = (m: Message) =>
      set((s) => {
        const prev = s.threads[conversationId] ?? EMPTY;
        return {
          threads: {
            ...s.threads,
            [conversationId]: {
              ...prev,
              messages: prev.messages.map((x) => (x.id === messageId ? m : x)),
            },
          },
        };
      });
    put({ ...before, content: text, edited_at: new Date().toISOString() });
    const { data, error } = await editMessage(messageId, text);
    put(error || !data ? before : data);
    return !error && !!data;
  },

  unsend: async (conversationId, messageId) => {
    const thread = get().threads[conversationId];
    if (!thread?.messages.some((m) => m.id === messageId)) return false;
    const keep = thread.messages;
    set((s) => ({
      threads: {
        ...s.threads,
        [conversationId]: {
          ...(s.threads[conversationId] ?? EMPTY),
          messages: keep.filter((m) => m.id !== messageId),
        },
      },
    }));
    const { error } = await unsendMessage(messageId);
    if (error) {
      set((s) => {
        const prev = s.threads[conversationId] ?? EMPTY;
        return {
          threads: {
            ...s.threads,
            [conversationId]: { ...prev, messages: merge(prev.messages, keep) },
          },
        };
      });
      return false;
    }
    useMessagesStore.getState().sync();
    return true;
  },

  start: async (otherUserId, _userId, content) => {
    const text = content.trim();
    if (!text) return null;
    const { data, error } = await startConversation(otherUserId, randomUUID(), text);
    if (error || !data) return null;
    set((s) => {
      const prev = s.threads[data.conversationId] ?? { ...EMPTY, isLoading: false };
      return {
        threads: {
          ...s.threads,
          [data.conversationId]: { ...prev, messages: merge(prev.messages, [data.message]) },
        },
      };
    });
    useMessagesStore.getState().sync();
    return { conversationId: data.conversationId, status: data.status };
  },

  markRead: async (conversationId) => {
    useMessagesStore.getState().clearUnread(conversationId);
    await markConversationRead(conversationId);
  },

  reset: () => {
    convoChannels.forEach((ch) => supabase.removeChannel(ch));
    convoChannels.clear();
    everConnected.clear();
    appStateSub?.remove();
    appStateSub = null;
    set({ threads: {} });
  },
}));
