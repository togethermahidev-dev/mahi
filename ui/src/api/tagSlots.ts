/**
 * Tag slots API (flag `tag-slots`; server: migration 20261003120000_tag_slots).
 *
 * A slot is filled on the tag screen before posting: a link made the moment you tap invite, or
 * an in-app invite for someone on Mahi who isn't your friend yet. `create_post` takes the slots
 * (`slotIds`); the server enforces the cap and every state.
 */
import { supabase } from '@/lib/supabase';
import type { TagSlot } from '@/lib/tagSlots';

/** Someone in the tag screen's search. */
export type TagPerson = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** You follow each other, so they can be tagged. */
  is_friend: boolean;
  /** You tagged or invited them and it's still open, or they tagged you. */
  has_open_tag: boolean;
  /** They tagged you and your post answers it, so you can't tag them back. */
  tagged_you: boolean;
  points: number;
};

/** A link made on tap. */
export type SlotLink = { challenge_id: string; token: string; code: string; url: string };

/** Where an in-app invite to you is at (your own rows; RLS keeps it so). */
export type TagInviteRow = {
  id: string;
  requested_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
};

type Result<T> = { data: T | null; error: Error | null };

/** Your slots not posted with yet, or (with `postId`) the slots of your post. */
export async function getTagSlots(postId?: string): Promise<Result<TagSlot[]>> {
  const { data, error } = await supabase.rpc('get_tag_slots', { p_post: postId ?? null });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as TagSlot[], error: null };
}

/** Friends with nothing typed; anyone on Mahi once something is typed. */
export async function searchTagPeople(query = '', limit = 50): Promise<Result<TagPerson[]>> {
  const { data, error } = await supabase.rpc('search_tag_people', {
    p_query: query,
    p_limit: limit,
  });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as TagPerson[], error: null };
}

export async function makeInviteLink(): Promise<Result<SlotLink>> {
  const { data, error } = await supabase.rpc('make_invite_link');
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as SlotLink, error: null };
}

export async function inviteToTag(userId: string): Promise<Result<{ challenge_id: string }>> {
  const { data, error } = await supabase.rpc('invite_to_tag', { p_user: userId });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as { challenge_id: string }, error: null };
}

export async function cancelTagSlot(challengeId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('cancel_tag_slot', { p_challenge: challengeId });
  return { error: error ? new Error(error.message, { cause: error }) : null };
}

export async function markInviteShared(challengeId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('mark_invite_shared', { p_challenge: challengeId });
  return { error: error ? new Error(error.message, { cause: error }) : null };
}

/** Accept (friends, and the tag lands) or "Not now". */
export async function respondTagInvite(
  challengeId: string,
  accept: boolean
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('respond_tag_invite', {
    p_challenge: challengeId,
    p_accept: accept,
  });
  return { error: error ? new Error(error.message, { cause: error }) : null };
}

/** Where each in-app invite to you is at. */
export async function getTagInviteRows(ids: string[]): Promise<Result<TagInviteRow[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from('tag_challenges')
    .select('id, requested_at, accepted_at, declined_at, cancelled_at')
    .in('id', ids);
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as TagInviteRow[], error: null };
}
