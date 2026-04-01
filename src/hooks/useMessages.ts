import { useEffect } from 'react';
import { sendMessage, createOrGetConversation, type ConversationPreview } from '@/api';
import { useAuthStore, useMessagesStore } from '@/store';
import type { Database } from '@/types';

type MsgRow = Database['public']['Tables']['messages']['Row'];

export interface UseMessagesResult {
  inbox:             ConversationPreview[];
  requests:          ConversationPreview[];
  isLoading:         boolean;
  refresh:           () => void;
  accept:            (conversationId: string) => Promise<void>;
  deny:              (conversationId: string) => Promise<void>;
  send:              (conversationId: string, content: string) => Promise<MsgRow | null>;
  /** Find or create a conversation with another user, returns the preview or null on error. */
  startConversation: (otherUserId: string) => Promise<ConversationPreview | null>;
}

export function useMessages(): UseMessagesResult {
  const userId    = useAuthStore((s) => s.user?.id);
  const inbox     = useMessagesStore((s) => s.inbox);
  const requests  = useMessagesStore((s) => s.requests);
  const isSyncing = useMessagesStore((s) => s.isSyncing);

  useEffect(() => {
    if (!userId) return;
    if (inbox.length === 0 && requests.length === 0 && !isSyncing) {
      useMessagesStore.getState().sync(userId);
    }
    useMessagesStore.getState().subscribeToInbox(userId);
    return () => { useMessagesStore.getState().unsubscribeFromInbox(userId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return {
    inbox,
    requests,
    isLoading:         isSyncing && inbox.length === 0 && requests.length === 0,
    refresh:           () => { if (userId) useMessagesStore.getState().sync(userId); },
    accept:            (id) => useMessagesStore.getState().accept(id),
    deny:              (id) => useMessagesStore.getState().deny(id),
    send:              async (conversationId, content) => {
      if (!userId) return null;
      const { data, error } = await sendMessage(conversationId, userId, content);
      return error ? null : data;
    },
    startConversation: async (otherUserId) => {
      if (!userId) return null;
      const { data, error } = await createOrGetConversation(userId, otherUserId);
      if (error || !data) return null;
      // Ensure the conversation is reflected in the store
      const store = useMessagesStore.getState();
      const inStore =
        store.inbox.some((c) => c.id === data.id) ||
        store.requests.some((c) => c.id === data.id);
      if (!inStore) {
        if (data.status === 'active') {
          useMessagesStore.setState((s) => ({ inbox: [data, ...s.inbox] }));
        } else {
          useMessagesStore.setState((s) => ({ requests: [data, ...s.requests] }));
        }
      }
      return data;
    },
  };
}
