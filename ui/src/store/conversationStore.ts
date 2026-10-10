import { create } from 'zustand';
import { AppState, type NativeEventSubscription } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import {
  getMessages,
  sendMessage,
  editMessage,
  unsendMessage,
  startConversation,
  markConversationRead,
  reactToMessage,
  getMessageReactions,
  MESSAGE_PAGE,
  type Message,
} from '@/api';
import { reactionsOf, toggleReaction, type ReactionSummary } from '@/lib/messageReactions';
import { messagePreviewText } from '@/lib/sharedPost';
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

/** One row of message_reactions as realtime sends it (a delete carries only its key). */
type ReactionRow = { message_id: string };

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
  /**
   * React to a message (the same emoji again takes yours off). Shows at once; the server's own
   * summary then replaces the guess, or the guess goes back if the server said no.
   */
  react: (conversationId: string, messageId: string, emoji: string) => Promise<boolean>;
  /** The first message to someone: the server makes the conversation. Null = it didn't send. */
  start: (
    otherUserId: string,
    userId: string,
    content: string
  ) => Promise<{ conversationId: string; status: string } | null>;
  markRead: (conversationId: string) => Promise<void>;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => {
  /** Put one message's reactions in place (the thread may have been closed meanwhile). */
  const putReactions = (conversationId: string, messageId: string, reactions: ReactionSummary[]) =>
    set((s) => {
      const prev = s.threads[conversationId];
      if (!prev) return {};
      return {
        threads: {
          ...s.threads,
          [conversationId]: {
            ...prev,
            messages: prev.messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
          },
        },
      };
    });

  /** A reaction changed live (either phone): re-read that one message's reactions. */
  const onReactionChange = async (
    conversationId: string,
    payload: { new?: unknown; old?: unknown }
  ) => {
    const row = (payload.new ?? payload.old) as Partial<ReactionRow> | undefined;
    const messageId = row?.message_id;
    if (!messageId) return;
    if (!get().threads[conversationId]?.messages.some((m) => m.id === messageId)) return;
    const { data, error } = await getMessageReactions(messageId);
    if (error || !data) {
      reportError(error ?? new Error('get_message_reactions returned nothing'), {
        flow: 'messages',
        action: 'liveReactions',
        extra: { conversationId, messageId, rpc: 'get_message_reactions' },
      });
      return;
    }
    putReactions(conversationId, messageId, data);
  };

  return {
    threads: {},

    refreshNewest: async (conversationId) => {
      const { data, error } = await getMessages(conversationId);
      if (error) {
        reportError(error, { flow: 'messages', action: 'loadMessages', extra: { conversationId } });
      }
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
              if (incoming.post_id) {
                // A shared post: the live row carries only its id, so the page is read again for
                // the post itself (and a post already on screen is never swapped for a bare row).
                void get().refreshNewest(conversationId);
              } else {
                set((s) => {
                  const prev = s.threads[conversationId] ?? EMPTY;
                  return {
                    threads: {
                      ...s.threads,
                      [conversationId]: { ...prev, messages: merge(prev.messages, [incoming]) },
                    },
                  };
                });
              }
              // The inbox line: a post with no note reads "Sent a post", as get_inbox says it.
              useMessagesStore.getState().patchConversationLastMessage(conversationId, {
                ...incoming,
                content: messagePreviewText(incoming),
              });
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
          // Reactions, as they change on either phone. A delete carries only its key (no
          // conversation), so it is heard for every chat and matched to this one's messages.
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'message_reactions',
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => void onReactionChange(conversationId, payload)
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'message_reactions',
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => void onReactionChange(conversationId, payload)
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'message_reactions' },
            (payload) => void onReactionChange(conversationId, payload)
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
      // A shared post can be deleted or made private after it was sent, so a chat holding one is
      // not kept: the next open shows loading, then what the server says now.
      if (get().threads[conversationId]?.messages.some((m) => m.post_id)) {
        set((s) => {
          const { [conversationId]: _gone, ...threads } = s.threads;
          return { threads };
        });
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

      const { data, error } = await getMessages(conversationId, {
        createdAt: oldest.created_at,
        id: oldest.id,
      });
      if (error) {
        reportError(error, {
          flow: 'messages',
          action: 'loadOlder',
          extra: { conversationId, loaded: thread.messages.length },
        });
      }

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
        reportError(error ?? new Error('send_message returned no message'), {
          flow: 'messages',
          action: 'sendMessage',
          extra: { conversationId, clientId, rpc: 'send_message' },
        });
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
      track('message_sent', { message_id: data.id, conversation_id: conversationId, first: false });
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
      if (error || !data) {
        reportError(error ?? new Error('edit_message returned no message'), {
          flow: 'messages',
          action: 'editMessage',
          extra: { conversationId, messageId, rpc: 'edit_message' },
        });
      }
      // The answer is the message alone: what only get_messages sends (a shared post) stays.
      put(error || !data ? before : { ...before, ...data });
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
        reportError(error, {
          flow: 'messages',
          action: 'unsendMessage',
          extra: { conversationId, messageId, rpc: 'unsend_message' },
        });
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

    react: async (conversationId, messageId, emoji) => {
      const before = get().threads[conversationId]?.messages.find((m) => m.id === messageId);
      if (!before || before.id.startsWith('temp_')) return false;
      const was = reactionsOf(before);
      putReactions(conversationId, messageId, toggleReaction(was, emoji));
      const { data, error } = await reactToMessage(messageId, emoji);
      if (error || !data) {
        reportError(error ?? new Error('react_to_message returned nothing'), {
          flow: 'messages',
          action: 'reactToMessage',
          extra: { conversationId, messageId, emoji, rpc: 'react_to_message' },
        });
        set((s) => {
          const prev = s.threads[conversationId];
          if (!prev) return {};
          return {
            threads: {
              ...s.threads,
              [conversationId]: {
                ...prev,
                messages: prev.messages.map((m) => (m.id === messageId ? before : m)),
              },
            },
          };
        });
        return false;
      }
      putReactions(conversationId, messageId, data);
      // Taking a reaction off is not a reaction.
      if (data.some((r) => r.mine && r.emoji === emoji)) track('message_reacted', { emoji });
      return true;
    },

    start: async (otherUserId, _userId, content) => {
      const text = content.trim();
      if (!text) return null;
      const { data, error } = await startConversation(otherUserId, randomUUID(), text);
      if (error || !data) {
        reportError(error ?? new Error('start_conversation returned no data'), {
          flow: 'messages',
          action: 'startConversation',
          extra: { otherUserId, rpc: 'start_conversation' },
        });
        return null;
      }
      track('message_sent', {
        message_id: data.message.id,
        conversation_id: data.conversationId,
        first: true,
      });
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
      const { error } = await markConversationRead(conversationId);
      if (error) {
        reportError(error, { flow: 'messages', action: 'markRead', extra: { conversationId } });
      }
    },

    reset: () => {
      convoChannels.forEach((ch) => supabase.removeChannel(ch));
      convoChannels.clear();
      everConnected.clear();
      appStateSub?.remove();
      appStateSub = null;
      set({ threads: {} });
    },
  };
});
