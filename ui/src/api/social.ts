/**
 * Social API
 *
 * Handles post likes and comments.
 */

import { supabase } from '@/lib/supabase';

export type CommentWithProfile = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
};

/**
 * Atomically toggle a like on a post.
 * Inserts if not liked, deletes if already liked.
 * Returns the authoritative liked state and count after the operation.
 */
export async function toggleLike(
  postId: string,
  userId: string
): Promise<{ data: { liked: boolean; like_count: number } | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('toggle_like', {
    p_post_id: postId,
    p_user_id: userId,
  });

  if (error) return { data: null, error: new Error(error.message) };
  const row = (data as { liked: boolean; like_count: number }[] | null)?.[0];
  if (!row) return { data: null, error: new Error('toggle_like returned no rows') };
  return { data: row, error: null };
}

/**
 * Fetch all comments for a post, oldest first.
 */
export async function getComments(
  postId: string
): Promise<{ data: CommentWithProfile[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('post_comments')
    .select(
      `
      id,
      post_id,
      user_id,
      content,
      created_at,
      profiles ( id, username, display_name, avatar_url )
    `
    )
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as CommentWithProfile[], error: null };
}

/**
 * Insert a comment and return the confirmed row with profile join.
 */
export async function addComment(
  postId: string,
  userId: string,
  content: string
): Promise<{ data: CommentWithProfile | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: userId, content })
    .select(
      `
      id,
      post_id,
      user_id,
      content,
      created_at,
      profiles ( id, username, display_name, avatar_url )
    `
    )
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as CommentWithProfile, error: null };
}

// ─── Comment likes (flag comment-likes) ──────────────────────────────────────

/** One comment's like count and whether the signed-in person liked it. */
export type CommentLikes = { comment_id: string; like_count: number; liked_by_me: boolean };

/** Someone who liked a comment (people blocked either way and banned profiles are left out). */
export type CommentLiker = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  liked_at: string;
};

/** Every comment on a post with its like count and whether you liked it. */
export async function getCommentLikes(
  postId: string
): Promise<{ data: CommentLikes[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_comment_likes', { p_post_id: postId });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data as CommentLikes[] | null) ?? [], error: null };
}

/** Like a comment, or take the like back (as yourself). Returns where it ended up and the count. */
export async function toggleCommentLike(
  commentId: string
): Promise<{ data: { liked: boolean; like_count: number } | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('toggle_comment_like', { p_comment_id: commentId });
  if (error) return { data: null, error: new Error(error.message) };
  const row = (data as { liked: boolean; like_count: number }[] | null)?.[0];
  if (!row) return { data: null, error: new Error('toggle_comment_like returned no rows') };
  return { data: row, error: null };
}

/** Who liked a comment, newest first. Read fresh each time; never kept on the device. */
export async function getCommentLikers(
  commentId: string
): Promise<{ data: CommentLiker[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_comment_likers', { p_comment_id: commentId });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data as CommentLiker[] | null) ?? [], error: null };
}
