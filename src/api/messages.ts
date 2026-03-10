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

type ConvRow  = Database['public']['Tables']['conversations']['Row'];
type MsgRow   = Database['public']['Tables']['messages']['Row'];
type ProfRow  = Database['public']['Tables']['profiles']['Row'];

export type ConversationPreview = ConvRow & {
  other_profile: Pick<ProfRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  last_message:  Pick<MsgRow, 'id' | 'content' | 'sender_id' | 'created_at'> | null;
  is_requester:  boolean;
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
  status: 'active' | 'requested',
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
      convos.map((c) =>
        c.participant_one === userId ? c.participant_two : c.participant_one,
      ),
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
    const sorted  = rawMsgs.slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    // Destructure out the raw messages array — not part of ConversationPreview
    const { messages: _msgs, ...convoFields } = c as typeof c & { messages: MsgRow[] };
    return {
      ...convoFields,
      other_profile: profileMap.get(otherId)!,
      last_message:  sorted[0] ?? null,
      is_requester:  c.initiated_by === userId,
    };
  });

  return { data: result, error: null };
}

/** Conversations where the current user is a participant and status = 'active'. */
export async function getInbox(
  userId: string,
): Promise<{ data: ConversationPreview[] | null; error: Error | null }> {
  return fetchConversations(userId, 'active');
}

/** Conversations where the current user is a participant and status = 'requested'. */
export async function getRequests(
  userId: string,
): Promise<{ data: ConversationPreview[] | null; error: Error | null }> {
  return fetchConversations(userId, 'requested');
}

/** Accept a message request — moves it from REQUESTS to INBOX. */
export async function acceptRequest(
  conversationId: string,
): Promise<{ error: Error | null }> {
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
  senderId:       string,
  content:        string,
): Promise<{ data: MsgRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content })
    .select()
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}
