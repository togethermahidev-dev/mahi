/**
 * Messages API
 *
 * Conversations have two participants and a status:
 *   'requested' — initiated but not yet accepted (REQUESTS tab)
 *   'active'    — accepted by the receiver (INBOX tab)
 *
 * Always insert conversations with participant_one = LEAST(a,b),
 * participant_two = GREATEST(a,b) to satisfy the ordered_participants constraint.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types';

type ConvRow = Database['public']['Tables']['conversations']['Row'];
type MsgRow = Database['public']['Tables']['messages']['Row'];
type ProfRow = Database['public']['Tables']['profiles']['Row'];

export type ConversationPreview = ConvRow & {
  other_profile: Pick<ProfRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  last_message: Pick<MsgRow, 'id' | 'content' | 'sender_id' | 'created_at'> | null;
  is_requester: boolean;
};

const CONVO_SELECT = `
  id,
  participant_one,
  participant_two,
  status,
  initiated_by,
  created_at,
  updated_at,
  messages ( id, content, sender_id, created_at )
` as const;

async function fetchConversations(
  userId: string,
  status: 'active' | 'requested'
): Promise<{ data: ConversationPreview[] | null; error: Error | null }> {
  const { data: convos, error: convosErr } = await supabase
    .from('conversations')
    .select(CONVO_SELECT)
    .or(`participant_one.eq.${userId},participant_two.eq.${userId}`)
    .eq('status', status)
    .order('updated_at', { ascending: false });

  if (convosErr) return { data: null, error: new Error(convosErr.message) };
  if (!convos || convos.length === 0) return { data: [], error: null };

  // Collect unique other-participant IDs
  const otherIds = [
    ...new Set(
      convos.map((c) => (c.participant_one === userId ? c.participant_two : c.participant_one))
    ),
  ];

  // Single batch fetch for all other profiles
  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', otherIds);

  if (profilesErr) return { data: null, error: new Error(profilesErr.message) };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const result: ConversationPreview[] = convos.map((c) => {
    const otherId = c.participant_one === userId ? c.participant_two : c.participant_one;
    const rawMsgs = (c.messages as MsgRow[] | undefined) ?? [];
    const sorted = rawMsgs
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    // Destructure out the raw messages array — not part of ConversationPreview
    const { messages: _msgs, ...convoFields } = c as typeof c & { messages: MsgRow[] };
    return {
      ...convoFields,
      other_profile: profileMap.get(otherId)!,
      last_message: sorted[0] ?? null,
      is_requester: c.initiated_by === userId,
    };
  });

  return { data: result, error: null };
}

/** Conversations where the current user is a participant and status = 'active'. */
export async function getInbox(
  userId: string
): Promise<{ data: ConversationPreview[] | null; error: Error | null }> {
  return fetchConversations(userId, 'active');
}

/** Conversations where the current user is a participant and status = 'requested'. */
export async function getRequests(
  userId: string
): Promise<{ data: ConversationPreview[] | null; error: Error | null }> {
  return fetchConversations(userId, 'requested');
}

/** Accept a message request — moves it from REQUESTS to INBOX. */
export async function acceptRequest(conversationId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('conversations')
    .update({ status: 'active' })
    .eq('id', conversationId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/** Send a message in an active conversation. */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<{ data: MsgRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content })
    .select()
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
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

  // Fetch the conversation (existing or newly created) with full preview shape
  const { data: convos, error: fetchErr } = await supabase
    .from('conversations')
    .select(CONVO_SELECT)
    .eq('participant_one', p1)
    .eq('participant_two', p2)
    .single();

  if (fetchErr || !convos)
    return { data: null, error: new Error(fetchErr?.message ?? 'Not found') };

  const otherId =
    convos.participant_one === senderId ? convos.participant_two : convos.participant_one;
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', otherId)
    .single();

  if (profErr || !profile)
    return { data: null, error: new Error(profErr?.message ?? 'Profile not found') };

  const rawMsgs = (convos as typeof convos & { messages?: MsgRow[] }).messages ?? [];
  const sorted = rawMsgs
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const { messages: _msgs, ...convoFields } = convos as typeof convos & { messages: MsgRow[] };

  const preview: ConversationPreview = {
    ...convoFields,
    other_profile: profile,
    last_message: sorted[0] ?? null,
    is_requester: convos.initiated_by === senderId,
  };

  return { data: preview, error: null };
}

/** Delete a conversation (used for DENY). Cascades to messages via FK. */
export async function deleteConversation(conversationId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/** Fetch all messages for a conversation, oldest first. */
export async function getMessages(
  conversationId: string
): Promise<{ data: MsgRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data ?? [], error: null };
}

export type { MsgRow };
