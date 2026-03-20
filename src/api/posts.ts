/**
 * Posts API
 *
 * Handles feed post creation and retrieval.
 * Posts are created when a user takes their daily streak photo.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types';

type PostRow    = Database['public']['Tables']['posts']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type FeedPost = PostRow & {
  profiles: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export type FeedCursor = { ts: string; id: string };

const FEED_SELECT = `
  id,
  user_id,
  image_url,
  caption,
  streak_day,
  created_at,
  profiles ( id, username, display_name, avatar_url )
` as const;

/**
 * Fetch a page of feed posts, newest first.
 * Pass `cursor` (from previous page's last item) for pagination.
 */
export async function getFeedPosts(
  limit: number,
  cursor?: FeedCursor,
): Promise<{ data: FeedPost[] | null; error: Error | null }> {
  let query = supabase
    .from('posts')
    .select(FEED_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return { data: null, error: new Error(error.message) };
  // PostgREST returns `profiles` as an array for FK joins; our FeedPost type
  // expects a single object. Cast through unknown — shape is correct at runtime.
  return { data: data as unknown as FeedPost[], error: null };
}

export type ProfilePostCursor = { ts: string; id: string };

/**
 * Fetch a page of posts for a specific user, newest first.
 * Used by the profile media canvas — no profiles join needed.
 */
export async function getUserPosts(
  userId: string,
  limit = 30,
  cursor?: ProfilePostCursor,
): Promise<{ data: PostRow[] | null; error: Error | null }> {
  let query = supabase
    .from('posts')
    .select('id, user_id, image_url, streak_day, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}

/**
 * Insert a new post record after a successful camera upload.
 */
export async function createPost(
  userId:    string,
  imageUrl:  string,
  streakDay: number,
  caption?:  string,
): Promise<{ data: PostRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('posts')
    .insert({ user_id: userId, image_url: imageUrl, streak_day: streakDay, caption })
    .select()
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}
