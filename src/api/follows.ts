/**
 * Follows API
 *
 * Follow / unfollow users, check status, get counts.
 */

import { supabase } from '@/lib/supabase';

/** Follow a user. Idempotent — duplicates are silently ignored. */
export async function followUser(
  followerId: string,
  followingId: string
): Promise<{ data: null; error: Error | null }> {
  const { error } = await supabase
    .from('follows')
    .upsert(
      { follower_id: followerId, following_id: followingId },
      { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
    );

  if (error) return { data: null, error: new Error(error.message) };
  return { data: null, error: null };
}

/** Unfollow a user. */
export async function unfollowUser(
  followerId: string,
  followingId: string
): Promise<{ data: null; error: Error | null }> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (error) return { data: null, error: new Error(error.message) };
  return { data: null, error: null };
}

export type FollowListUser = {
  id: string;
  username: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

/** Fetch the list of followers or following for a user. */
export async function getFollowList(
  userId: string,
  type: 'followers' | 'following'
): Promise<{ data: FollowListUser[] | null; error: Error | null }> {
  if (type === 'followers') {
    const { data, error } = await supabase
      .from('follows')
      .select(
        'profiles!follows_follower_id_fkey(id, username, display_name, first_name, last_name, avatar_url)'
      )
      .eq('following_id', userId)
      .order('created_at', { ascending: false });

    if (error) return { data: null, error: new Error(error.message) };
    const users = (data ?? []).map((row: any) => row.profiles as FollowListUser);
    return { data: users, error: null };
  }

  const { data, error } = await supabase
    .from('follows')
    .select(
      'profiles!follows_following_id_fkey(id, username, display_name, first_name, last_name, avatar_url)'
    )
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: new Error(error.message) };
  const users = (data ?? []).map((row: any) => row.profiles as FollowListUser);
  return { data: users, error: null };
}

/** Fetch follow status + counts in a single RPC call. */
export async function getFollowData(
  currentUserId: string,
  targetUserId: string
): Promise<{
  data: { is_following: boolean; follower_count: number; following_count: number } | null;
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc('get_follow_data', {
    p_current_user_id: currentUserId,
    p_target_user_id: targetUserId,
  });

  if (error) return { data: null, error: new Error(error.message) };
  const row = (
    data as { is_following: boolean; follower_count: number; following_count: number }[]
  )?.[0];
  if (!row) return { data: null, error: new Error('get_follow_data returned no rows') };
  return { data: row, error: null };
}
