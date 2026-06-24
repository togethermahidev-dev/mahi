import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getMessages, sendMessage } from '@/api';
import { useAuthStore, useMessagesStore } from '@/store';
import type { Database } from '@/types';

type MsgRow = Database['public']['Tables']['messages']['Row'];

export interface UseConversationResult {
  messages: MsgRow[];
  isLoading: boolean;
  send: (content: string) => Promise<void>;
}

export function useConversation(conversationId: string): UseConversationResult {
  const userId = useAuthStore((s) => s.user?.id);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Keep a stable ref for use inside the realtime callback
  const messagesRef = useRef<MsgRow[]>(messages);
  messagesRef.current = messages;

  // Load history on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getMessages(conversationId).then(({ data }) => {
      if (!cancelled && data) setMessages(data);
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Real-time: subscribe to new messages inserted into this conversation
  useEffect(() => {
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
          const incoming = payload.new as MsgRow;
          const current = messagesRef.current;

          // Deduplicate: ignore if we already have the real id
          if (current.some((m) => m.id === incoming.id)) return;

          // Replace the most recent temp message from the same sender, if any
          const tempIdx = [...current]
            .reverse()
            .findIndex((m) => m.id.startsWith('temp_') && m.sender_id === incoming.sender_id);
          const realIdx = tempIdx >= 0 ? current.length - 1 - tempIdx : -1;

          if (realIdx >= 0) {
            setMessages((prev) => {
              const next = [...prev];
              next[realIdx] = incoming;
              return next;
            });
          } else {
            setMessages((prev) => [...prev, incoming]);
          }

          // Update the preview in the messages list
          useMessagesStore.getState().patchConversationLastMessage(conversationId, incoming);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const send = async (content: string) => {
    if (!userId || !content.trim()) return;

    // Optimistic insert
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const optimistic: MsgRow = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: userId,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    const { data, error } = await sendMessage(conversationId, userId, content);

    if (error) {
      // Rollback
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } else if (data) {
      // Replace temp with confirmed row (realtime may also arrive — dedup handles it)
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
      useMessagesStore.getState().patchConversationLastMessage(conversationId, data);
    }
  };

  return { messages, isLoading, send };
}
