import { useEffect } from 'react';
import { createOrGetConversation, isDraft, type ConversationPreview } from '@/api';
import { useAuthStore, useConversationStore, useMessagesStore } from '@/store';

export interface UseMessagesResult {
  inbox: ConversationPreview[];
  requests: ConversationPreview[];
  /** Nothing read yet this session (a spinner, never "No messages yet"). */
  isLoading: boolean;
  /** The read failed and the inbox is empty (show "Couldn't load…" with Try again). */
  failed: boolean;
  refresh: () => void;
  accept: (conversationId: string) => Promise<void>;
  deny: (conversationId: string) => Promise<void>;
  send: (conversationId: string, content: string) => Promise<boolean>;
  /** Find or create a conversation with another user, returns the preview or null on error. */
  startConversation: (otherUserId: string) => Promise<ConversationPreview | null>;
}

export function useMessages(): UseMessagesResult {
  const userId = useAuthStore((s) => s.user?.id);
  const inbox = useMessagesStore((s) => s.inbox);
  const requests = useMessagesStore((s) => s.requests);
  const isSyncing = useMessagesStore((s) => s.isSyncing);
  const loaded = useMessagesStore((s) => s.loaded);
  const error = useMessagesStore((s) => s.error);

  useEffect(() => {
    if (!userId) return;
    if (inbox.length === 0 && requests.length === 0 && !isSyncing) {
      useMessagesStore.getState().sync();
    }
    useMessagesStore.getState().subscribeToInbox(userId);
    return () => {
      useMessagesStore.getState().unsubscribeFromInbox(userId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return {
    inbox,
    requests,
    isLoading: !loaded && !error && inbox.length === 0,
    failed: error && inbox.length === 0,
    refresh: () => {
      if (userId) useMessagesStore.getState().sync();
    },
    accept: (id) => useMessagesStore.getState().accept(id),
    deny: (id) => useMessagesStore.getState().deny(id),
    send: async (conversationId, content) => {
      if (!userId) return false;
      return useConversationStore.getState().send(conversationId, userId, content);
    },
    startConversation: async (otherUserId) => {
      if (!userId) return null;
      const { data, error } = await createOrGetConversation(userId, otherUserId);
      if (error || !data) return null;
      // A draft has no conversation on the server yet: it joins the inbox with its first message.
      if (isDraft(data.id)) return data;
      // Ensure the conversation is reflected in the store
      const store = useMessagesStore.getState();
      const inStore =
        store.inbox.some((c) => c.id === data.id) || store.requests.some((c) => c.id === data.id);
      if (!inStore) {
        if (data.status === 'active' || data.is_requester) {
          useMessagesStore.setState((s) => ({ inbox: [data, ...s.inbox] }));
        } else {
          useMessagesStore.setState((s) => ({ requests: [data, ...s.requests] }));
        }
      }
      return data;
    },
  };
}
