/**
 * Messages API
 *
 * Conversations have two participants and a status:
 *   'requested' — initiated but not yet accepted (REQUESTS tab)
 *   'active'    — accepted by the receiver (INBOX tab)
 *   'blocked'   — one side blocked the other; frozen until they unblock
 *
 * Sending, reading and unread counts all go through server functions (send_message,
 * get_messages, mark_conversation_read, get_inbox), so the rules live in one place and a
 * retry can never make a second message.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types';

type ProfRow = Database['public']['Tables']['profiles']['Row'];

/** One message as public.message_json returns it. */
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  client_id: string | null;
  created_at: string;
};

export type ConversationPreview = {
  id: string;
  status: string;
  initiated_by: string;
  updated_at: string;
  is_requester: boolean;
  unread_count: number;
  other_profile: Pick<ProfRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  last_message: Pick<Message, 'id' | 'content' | 'sender_id' | 'created_at'> | null;
};

type InboxRow = Database['public']['Functions']['get_inbox']['Returns'][number];

function toPreview(r: InboxRow): ConversationPreview {
  return {
    id: r.id,
    status: r.status,
    initiated_by: r.initiated_by,
    updated_at: r.updated_at,
    is_requester: r.is_requester,
    unread_count: r.unread_count,
    other_profile: {
      id: r.other_id,
      username: r.other_username,
      display_name: r.other_display_name,
      avatar_url: r.other_avatar_url,
    },
    last_message:
      r.last_message_id && r.last_message_at
        ? {
            id: r.last_message_id,
            content: r.last_message ?? '',
            sender_id: r.last_message_sender ?? '',
            created_at: r.last_message_at,
          }
        : null,
  };
}

async function fetchConversations(
  status: 'active' | 'requested'
): Promise<{ data: ConversationPreview[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_inbox', { p_status: status });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data ?? []).map(toPreview), error: null };
}

/** Accepted conversations, newest activity first, each with its unread count. */
export async function getInbox(): Promise<{
  data: ConversationPreview[] | null;
  error: Error | null;
}> {
  return fetchConversations('active');
}

/** Conversations still waiting to be accepted. */
export async function getRequests(): Promise<{
  data: ConversationPreview[] | null;
  error: Error | null;
}> {
  return fetchConversations('requested');
}

/** Accept a message request — moves it from REQUESTS to INBOX. Only the receiver may. */
export async function acceptRequest(conversationId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('conversations')
    .update({ status: 'active' })
    .eq('id', conversationId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Send a message. `clientId` is generated on the phone: sending it twice (a retry after a
 * dropped connection) returns the message the first attempt made instead of a second one.
 */
export async function sendMessage(
  conversationId: string,
  clientId: string,
  content: string
): Promise<{ data: Message | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('send_message', {
    p_conversation_id: conversationId,
    p_client_id: clientId,
    p_content: content,
  });

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as Message, error: null };
}

/**
 * Create a new conversation or return the existing one between two users.
 * Uses LEAST/GREATEST ordering so the unique constraint on (participant_one, participant_two)
 * is always satisfied regardless of argument order.
 */
export async function createOrGetConversation(
  senderId: string,
  receiverId: string
): Promise<{ data: ConversationPreview | null; error: Error | null }> {
  const p1 = senderId < receiverId ? senderId : receiverId;
  const p2 = senderId < receiverId ? receiverId : senderId;

  // Upsert — ignore duplicate (existing conversation stays as-is)
  const { error: upsertErr } = await supabase
    .from('conversations')
    .upsert(
      { participant_one: p1, participant_two: p2, status: 'requested', initiated_by: senderId },
      { onConflict: 'participant_one,participant_two', ignoreDuplicates: true }
    );

  if (upsertErr) return { data: null, error: new Error(upsertErr.message) };

  const { data: convo, error: fetchErr } = await supabase
    .from('conversations')
    .select('id, status, initiated_by, updated_at')
    .eq('participant_one', p1)
    .eq('participant_two', p2)
    .single();

  if (fetchErr || !convo) return { data: null, error: new Error(fetchErr?.message ?? 'Not found') };

  const otherId = senderId === p1 ? p2 : p1;
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', otherId)
    .single();

  if (profErr || !profile)
    return { data: null, error: new Error(profErr?.message ?? 'Profile not found') };

  return {
    data: {
      id: convo.id,
      status: convo.status,
      initiated_by: convo.initiated_by,
      updated_at: convo.updated_at,
      is_requester: convo.initiated_by === senderId,
      unread_count: 0,
      other_profile: profile,
      last_message: null,
    },
    error: null,
  };
}

/** Delete a conversation (used for DENY). Cascades to messages via FK. */
export async function deleteConversation(conversationId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/** How many messages one page holds. */
export const MESSAGE_PAGE = 30;

/**
 * One page of a conversation, oldest first. Pass the oldest message you already have as
 * `before` to get the page before it.
 */
export async function getMessages(
  conversationId: string,
  before?: { createdAt: string; id: string }
): Promise<{ data: Message[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_messages', {
    p_conversation_id: conversationId,
    p_before: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: MESSAGE_PAGE,
  });

  if (error) return { data: null, error: new Error(error.message) };
  // The server returns newest first; the screen reads oldest first.
  return { data: (data as unknown as Message[]).slice().reverse(), error: null };
}

/** Mark everything in a conversation as read, up to now. */
export async function markConversationRead(
  conversationId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });

  if (error) return { error: new Error(error.message) };
  return { error: null };
}
