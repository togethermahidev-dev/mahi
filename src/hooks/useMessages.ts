import { useEffect } from 'react';
import { sendMessage, type ConversationPreview } from '@/api';
import { useAuthStore, useMessagesStore } from '@/store';
import type { Database } from '@/types';

type MsgRow = Database['public']['Tables']['messages']['Row'];

export interface UseMessagesResult {
  inbox:     ConversationPreview[];
  requests:  ConversationPreview[];
  isLoading: boolean;
  refresh:   () => void;
  accept:    (conversationId: string) => Promise<void>;
  send:      (conversationId: string, content: string) => Promise<MsgRow | null>;
}

export function useMessages(): UseMessagesResult {
  const userId   = useAuthStore((s) => s.user?.id);
  const inbox    = useMessagesStore((s) => s.inbox);
  const requests = useMessagesStore((s) => s.requests);
  const isSyncing = useMessagesStore((s) => s.isSyncing);

  useEffect(() => {
    if (!userId) return;
    if (inbox.length === 0 && requests.length === 0 && !isSyncing) {
      useMessagesStore.getState().sync(userId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return {
    inbox,
    requests,
    isLoading: isSyncing && inbox.length === 0 && requests.length === 0,
    refresh:   () => { if (userId) useMessagesStore.getState().sync(userId); },
    accept:    (id) => useMessagesStore.getState().accept(id),
    send:      async (conversationId, content) => {
      if (!userId) return null;
      const { data, error } = await sendMessage(conversationId, userId, content);
      return error ? null : data;
    },
  };
}
