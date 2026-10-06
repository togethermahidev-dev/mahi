import { useEffect } from 'react';
import { useAuthStore, useConversationStore } from '@/store';
import { isDraft, type Message } from '@/api';

export interface UseConversationResult {
  messages: Message[];
  isLoading: boolean;
  isLoadingOlder: boolean;
  hasMore: boolean;
  /** False when the message didn't send — the screen puts the text back. */
  send: (content: string) => Promise<boolean>;
  loadOlder: () => void;
  markRead: () => void;
  edit: (messageId: string, content: string) => Promise<boolean>;
  unsend: (messageId: string) => Promise<boolean>;
}

/** One conversation, live. All of it lives in conversationStore; this is the screen's view. */
export function useConversation(conversationId: string): UseConversationResult {
  const userId = useAuthStore((s) => s.user?.id);
  const thread = useConversationStore((s) => s.threads[conversationId]);

  const draft = isDraft(conversationId);

  useEffect(() => {
    // A draft has nothing on the server to load or listen to until its first message.
    if (draft) return;
    useConversationStore.getState().open(conversationId);
    return () => {
      useConversationStore.getState().close(conversationId);
    };
  }, [conversationId, draft]);

  return {
    messages: thread?.messages ?? [],
    isLoading: draft ? false : (thread?.isLoading ?? true),
    isLoadingOlder: thread?.isLoadingOlder ?? false,
    hasMore: thread?.hasMore ?? false,
    send: async (content) => {
      if (!userId) return false;
      return useConversationStore.getState().send(conversationId, userId, content);
    },
    loadOlder: () => {
      useConversationStore.getState().loadOlder(conversationId);
    },
    markRead: () => {
      if (!draft) useConversationStore.getState().markRead(conversationId);
    },
    edit: (messageId, content) =>
      useConversationStore.getState().edit(conversationId, messageId, content),
    unsend: (messageId) => useConversationStore.getState().unsend(conversationId, messageId),
  };
}
