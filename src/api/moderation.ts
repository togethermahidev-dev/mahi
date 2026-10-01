/**
 * Moderation API
 *
 * Block / unblock users, report users or posts.
 */

import { supabase } from '@/lib/supabase';

export type BlockedUser = {
  id: string;
  blocked_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate_content'
  | 'impersonation'
  | 'other';

/** Block a user. Idempotent — duplicates are silently ignored. */
export async function blockUser(
  blockerId: string,
  blockedId: string
): Promise<{ data: null; error: Error | null }> {
  if (blockerId === blockedId) return { data: null, error: new Error('Cannot block yourself') };
  const { error } = await supabase
    .from('user_blocks')
    .upsert(
      { blocker_id: blockerId, blocked_id: blockedId },
      { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }
    );

  if (error) return { data: null, error: new Error(error.message) };
  return { data: null, error: null };
}

/** Unblock a user. */
export async function unblockUser(
  blockerId: string,
  blockedId: string
): Promise<{ data: null; error: Error | null }> {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);

  if (error) return { data: null, error: new Error(error.message) };
  return { data: null, error: null };
}

/** Fetch all users blocked by the current user, with profile info. */
export async function getBlockedUsers(
  userId: string
): Promise<{ data: BlockedUser[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select(
      'id, blocked_id, profiles!user_blocks_blocked_id_fkey(id, username, display_name, avatar_url)'
    )
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: new Error(error.message) };

  const users: BlockedUser[] = (data ?? []).map((row: any) => ({
    id: row.id,
    blocked_id: row.blocked_id,
    username: row.profiles?.username ?? '',
    display_name: row.profiles?.display_name ?? null,
    avatar_url: row.profiles?.avatar_url ?? null,
  }));

  return { data: users, error: null };
}

/**
 * Fetch the set of blocked user IDs in both directions for local gating.
 * blockedByMe = users I have blocked.
 * blockedMe   = users who have blocked me.
 */
export async function getBlockedIds(
  userId: string
): Promise<{ data: { blockedByMe: string[]; blockedMe: string[] } | null; error: Error | null }> {
  const [byMe, me] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', userId),
    supabase.from('user_blocks').select('blocker_id').eq('blocked_id', userId),
  ]);

  if (byMe.error) return { data: null, error: new Error(byMe.error.message) };
  if (me.error) return { data: null, error: new Error(me.error.message) };

  return {
    data: {
      blockedByMe: (byMe.data ?? []).map((r: any) => r.blocked_id as string),
      blockedMe: (me.data ?? []).map((r: any) => r.blocker_id as string),
    },
    error: null,
  };
}

/** Report a user or post. Uses insert — duplicate user reports are caught by
 *  the unique constraint and surfaced as an error so the UI can show feedback. */
export async function reportUser(opts: {
  reporterId: string;
  reportedUserId?: string;
  reportedPostId?: string;
  reason: ReportReason;
  description?: string;
}): Promise<{ data: null; error: Error | null }> {
  const { reporterId, reportedUserId, reportedPostId, reason, description } = opts;
  const { error } = await supabase.from('user_reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId ?? null,
    reported_post_id: reportedPostId ?? null,
    reason,
    description: description ?? null,
  });

  if (error) {
    // Unique constraint violation = already reported this user
    if (error.code === '23505') return { data: null, error: new Error('Already reported') };
    return { data: null, error: new Error(error.message) };
  }
  return { data: null, error: null };
}

/** Check if the current user has already reported a target user. */
export async function hasReported(
  reporterId: string,
  reportedUserId: string
): Promise<{ data: boolean; error: Error | null }> {
  const { count, error } = await supabase
    .from('user_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', reporterId)
    .eq('reported_user_id', reportedUserId);

  if (error) return { data: false, error: new Error(error.message) };
  return { data: (count ?? 0) > 0, error: null };
}
