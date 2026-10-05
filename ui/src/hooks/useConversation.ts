import { useEffect } from 'react';
import { useAuthStore, useConversationStore } from '@/store';
import type { Message } from '@/api';

export interface UseConversationResult {
  messages: Message[];
  isLoading: boolean;
  isLoadingOlder: boolean;
  hasMore: boolean;
  /** False when the message didn't send — the screen puts the text back. */
  send: (content: string) => Promise<boolean>;
  loadOlder: () => void;
  markRead: () => void;
}

/** One conversation, live. All of it lives in conversationStore; this is the screen's view. */
export function useConversation(conversationId: string): UseConversationResult {
  const userId = useAuthStore((s) => s.user?.id);
  const thread = useConversationStore((s) => s.threads[conversationId]);

  useEffect(() => {
    useConversationStore.getState().open(conversationId);
    return () => {
      useConversationStore.getState().close(conversationId);
    };
  }, [conversationId]);

  return {
    messages: thread?.messages ?? [],
    isLoading: thread?.isLoading ?? true,
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
      useConversationStore.getState().markRead(conversationId);
    },
  };
}
