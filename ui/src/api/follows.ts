/**
 * Follows API
 *
 * Follow / unfollow users (only through set_following), check status, get counts. Private
 * accounts (20261008170000_private_accounts): a follow to a private account is a request the
 * owner answers; the owner can remove a follower and set their Controls.
 */

import { supabase } from '@/lib/supabase';
import type { AccountControls, PostsVisibility, TagPermission } from '@/lib/accountControls';

type Result<T> = { data: T | null; error: Error | null };
const failed = (error: { message: string }): { data: null; error: Error } => ({
  data: null,
  error: new Error(error.message, { cause: error }),
});

/** Where my follow to someone stands: following, a request waiting, or nothing. */
export type FollowStatus = 'following' | 'requested' | 'none';

export type FollowMutationData = FollowData & {
  /** The signed-in user's committed following count after this mutation. */
  current_following_count: number;
  /** `requested`: the target is private and the follow is a request they answer. */
  status: FollowStatus;
};

/** Set one follow relationship and return the committed server state. */
export async function setFollowing(
  targetUserId: string,
  following: boolean
): Promise<Result<FollowMutationData>> {
  const { data, error } = await supabase.rpc('set_following', {
    p_target_user_id: targetUserId,
    p_following: following,
  });
  if (error) return failed(error);
  const row = (data as Partial<FollowMutationData>[] | null)?.[0];
  if (!row) return { data: null, error: new Error('set_following returned no rows') };
  return {
    data: {
      ...(row as FollowMutationData),
      follows_you: row.follows_you === true,
      // A server before private accounts sends no status: read it from is_following.
      status: row.status ?? (row.is_following ? 'following' : 'none'),
      is_private: row.is_private === true,
    },
    error: null,
  };
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

    if (error) return { data: null, error: new Error(error.message, { cause: error }) };
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

  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  const users = (data ?? []).map((row: any) => row.profiles as FollowListUser);
  return { data: users, error: null };
}

/** People who follow `userId` and are followed back. Blocked and banned users are left out. */
export async function getFriends(
  userId: string,
  limit = 100,
  offset = 0
): Promise<{ data: FollowListUser[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_friends', {
    p_user: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as FollowListUser[], error: null };
}

export type FollowData = {
  is_following: boolean;
  /** Null when the server keeps the counts back: a block between you (20261010110000_profile_bio). */
  follower_count: number | null;
  following_count: number | null;
  /** They follow you (20261006110000_follow_back); false from a server without it. */
  follows_you: boolean;
  /** I have a follow request waiting with them (private accounts); false from an older server. */
  requested?: boolean;
  /** Their account is private; false from an older server. */
  is_private: boolean;
};

/** Fetch follow status + counts in a single RPC call. */
export async function getFollowData(
  currentUserId: string,
  targetUserId: string
): Promise<{ data: FollowData | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_follow_data', {
    p_current_user_id: currentUserId,
    p_target_user_id: targetUserId,
  });

  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  const row = (data as Partial<FollowData>[] | null)?.[0];
  if (!row) return { data: null, error: new Error('get_follow_data returned no rows') };
  return {
    data: {
      ...(row as FollowData),
      follows_you: row.follows_you === true,
      requested: row.requested === true,
      is_private: row.is_private === true,
    },
    error: null,
  };
}

/** Someone asking to follow you (`get_follow_requests`, newest first). */
export type FollowRequest = {
  requester_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  requested_at: string;
};

/** Your incoming follow requests. Banned and blocked people are left out by the server. */
export async function getFollowRequests(): Promise<Result<FollowRequest[]>> {
  const { data, error } = await supabase.rpc('get_follow_requests');
  if (error) return failed(error);
  return { data: (data ?? []) as FollowRequest[], error: null };
}

/** What answering a follow request did. `gone`: it was already answered or taken back. */
export type FollowRequestAnswer = {
  status: 'accepted' | 'declined' | 'gone';
  /** Your follow back, when asked for (`requested` if they are private too). */
  follow_back: FollowStatus | null;
};

/** Confirm (optionally following them back) or delete a follow request to you. */
export async function respondFollowRequest(
  requesterId: string,
  accept: boolean,
  followBack = false
): Promise<Result<FollowRequestAnswer>> {
  const { data, error } = await supabase.rpc('respond_follow_request', {
    p_requester: requesterId,
    p_accept: accept,
    p_follow_back: followBack,
  });
  if (error) return failed(error);
  return { data: data as unknown as FollowRequestAnswer, error: null };
}

/** Remove someone who follows you. They aren't told; a friend's open tags with you end. */
export async function removeFollower(
  followerId: string
): Promise<Result<{ removed: boolean; tags_ended: number }>> {
  const { data, error } = await supabase.rpc('remove_follower', { p_follower: followerId });
  if (error) return failed(error);
  return { data: data as unknown as { removed: boolean; tags_ended: number }, error: null };
}

/** Change any of your Controls; the ones left out stay as they are. */
export async function setAccountControls(patch: {
  is_private?: boolean;
  posts_visibility?: PostsVisibility;
  tag_permission?: TagPermission;
}): Promise<Result<AccountControls & { accepted_requests: number }>> {
  const { data, error } = await supabase.rpc('set_account_controls', {
    p_is_private: patch.is_private ?? null,
    p_posts_visibility: patch.posts_visibility ?? null,
    p_tag_permission: patch.tag_permission ?? null,
  });
  if (error) return failed(error);
  return { data: data as unknown as AccountControls & { accepted_requests: number }, error: null };
}

/** A suggested user to follow. Only public profile fields (the RPC enforces this). */
export interface SuggestedUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Number of mutual connections (follow-of-follows). Absent for popularity fallback. */
  mutual_count?: number;
  /** Their account is private (a follow is a request); missing from an older server. */
  is_private?: boolean;
}

/** Fetch follow suggestions (follow-of-follows, block-filtered) via a single RPC. */
export async function getSuggestedFollows(
  currentUserId: string,
  limit = 20,
  offset = 0
): Promise<{ data: SuggestedUser[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_suggested_follows', {
    p_current_user_id: currentUserId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as SuggestedUser[], error: null };
}
