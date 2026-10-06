/**
 * Messages API
 *
 * Works like PingMee-v2's, and the server decides everything:
 *   - Opening a chat makes nothing. The first message makes the conversation: straight into the
 *     inbox between friends (people who follow each other), otherwise a message request.
 *   - While a request waits the sender can't send more; the receiver accepts, declines or blocks.
 *     Declining is quiet — the sender still sees it waiting.
 *   - You can edit your own message for 15 minutes (shown "Edited") and unsend it any time.
 *
 * Statuses: 'requested' (waiting), 'active', 'blocked'; 'draft' is the app's own — a chat with
 * no message yet, so nothing on the server.
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
  /** Set when the sender edited it. */
  edited_at?: string | null;
  /** Set when the sender unsent it (the text is then empty). */
  unsent_at?: string | null;
};

/** How long after sending a message its sender can still edit it (the server's rule). */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** A chat with someone you haven't messaged yet has this id until its first message. */
export const DRAFT_PREFIX = 'draft:';
export const isDraft = (conversationId: string): boolean => conversationId.startsWith(DRAFT_PREFIX);

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

/**
 * Your conversations, newest activity first, each with its unread count. Includes requests you
 * sent that are still waiting (status 'requested').
 */
export async function getInbox(): Promise<{
  data: ConversationPreview[] | null;
  error: Error | null;
}> {
  return fetchConversations('active');
}

/** Requests other people sent you that you haven't answered. */
export async function getRequests(): Promise<{
  data: ConversationPreview[] | null;
  error: Error | null;
}> {
  return fetchConversations('requested');
}

/** Accept a message request — moves it from requests to the inbox. Only the receiver may. */
export async function acceptRequest(conversationId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('accept_message_request', {
    p_conversation_id: conversationId,
  });
  return { error: error ? new Error(error.message) : null };
}

/** Decline a message request. Quiet: it leaves your requests and the sender isn't told. */
export async function declineRequest(conversationId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('decline_message_request', {
    p_conversation_id: conversationId,
  });
  return { error: error ? new Error(error.message) : null };
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
 * Your conversation with someone. If you've never messaged each other it's a draft (nothing on
 * the server) until the first message goes through startConversation.
 */
export async function createOrGetConversation(
  senderId: string,
  receiverId: string
): Promise<{ data: ConversationPreview | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_conversation_with', { p_other: receiverId });
  if (error) return { data: null, error: new Error(error.message) };
  const row = (data ?? [])[0];
  if (row) return { data: toPreview(row), error: null };

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', receiverId)
    .single();
  if (profErr || !profile)
    return { data: null, error: new Error(profErr?.message ?? 'Profile not found') };

  return {
    data: {
      id: `${DRAFT_PREFIX}${receiverId}`,
      status: 'draft',
      initiated_by: senderId,
      updated_at: new Date().toISOString(),
      is_requester: true,
      unread_count: 0,
      other_profile: profile,
      last_message: null,
    },
    error: null,
  };
}

/**
 * The first message to someone. The server makes the conversation — a request unless you're
 * friends — and sends the message. Safe to retry with the same client id.
 */
export async function startConversation(
  otherUserId: string,
  clientId: string,
  content: string
): Promise<{
  data: { conversationId: string; status: string; message: Message } | null;
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc('start_conversation', {
    p_other: otherUserId,
    p_client_id: clientId,
    p_content: content,
  });
  if (error) return { data: null, error: new Error(error.message) };
  const r = data as unknown as { conversation_id: string; status: string; message: Message };
  return {
    data: { conversationId: r.conversation_id, status: r.status, message: r.message },
    error: null,
  };
}

/** Edit your own message (within 15 minutes of sending it). */
export async function editMessage(
  messageId: string,
  content: string
): Promise<{ data: Message | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('edit_message', {
    p_message_id: messageId,
    p_content: content,
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as Message, error: null };
}

/** Unsend your own message: it's gone for both of you. */
export async function unsendMessage(messageId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('unsend_message', { p_message_id: messageId });
  return { error: error ? new Error(error.message) : null };
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

/** Still inside the 15 minutes its sender has to edit it. */
export const canStillEdit = (createdAt: string, now: number = Date.now()): boolean =>
  now - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
