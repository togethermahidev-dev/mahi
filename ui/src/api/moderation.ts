/**
 * Moderation API
 *
 * Block / unblock users; report people, posts and comments; read your own standing
 * (docs/moderation.md).
 */

import { supabase } from '@/lib/supabase';

export type BlockedUser = {
  id: string;
  blocked_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Reason codes the server accepts (docs/moderation.md, "Report reasons"). */
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'sexual_content'
  | 'violence'
  | 'self_harm'
  | 'scam'
  | 'impersonation'
  | 'underage'
  | 'inappropriate_content'
  | 'other';

/** What can be reported from the app, and the server call for each. */
export type ReportKind = 'user' | 'post' | 'comment';

export type ReportResult = { report_id: string; already_reported: boolean };

const REPORT_CALLS: Record<ReportKind, { fn: string; arg: string }> = {
  user: { fn: 'report_user', arg: 'p_user_id' },
  post: { fn: 'report_post', arg: 'p_post_id' },
  comment: { fn: 'report_comment', arg: 'p_comment_id' },
};

/** Report a person, post or comment. A repeat is not an error: `already_reported` is true. */
export async function reportContent(
  kind: ReportKind,
  id: string,
  reason: ReportReason,
  details?: string
): Promise<{ data: ReportResult | null; error: Error | null }> {
  const { fn, arg } = REPORT_CALLS[kind];
  const { data, error } = await supabase.rpc(
    fn as never,
    {
      [arg]: id,
      p_reason: reason,
      p_details: details ?? null,
    } as never
  );
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as ReportResult, error: null };
}

export type Standing = {
  status: 'ok' | 'suspended' | 'banned';
  until: string | null;
  reason: string | null;
  warnings: { id: string; reason: string; created_at: string }[];
};

/** Your own standing: unseen warnings, and a suspension or ban if there is one. */
export async function getMyStanding(): Promise<{ data: Standing | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_my_standing' as never);
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as Standing, error: null };
}

/** Stop the current warnings appearing in getMyStanding. */
export async function markWarningsSeen(): Promise<{ data: null; error: Error | null }> {
  const { error } = await supabase.rpc('mark_warnings_seen' as never);
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: null, error: null };
}

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

  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
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

  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
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

  if (error) return { data: null, error: new Error(error.message, { cause: error }) };

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

  if (error) return { data: false, error: new Error(error.message, { cause: error }) };
  return { data: (count ?? 0) > 0, error: null };
}
