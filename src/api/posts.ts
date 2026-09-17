/**
 * Posts API
 *
 * Handles feed post creation and retrieval.
 * Posts are created when a user takes their daily streak photo.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types';
import type { StreakResult } from './streaks';
import { getPostResponses } from './tags';

type PostRow = Database['public']['Tables']['posts']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type TaggedUser = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type FeedPost = PostRow & {
  profiles: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  tagged_users: TaggedUser[];
  /** Set when this post answered a tag: whose, and how fast (oldest tag). */
  response?: { tagger_username: string; seconds: number } | null;
};

export type FeedCursor = { ts: string; id: string };

/**
 * Fetch a page of feed posts, newest first.
 * Uses the get_feed_posts RPC which returns like_count, comment_count, and
 * liked_by_me (whether auth.uid() has liked each post) in a single query.
 * Pass `cursor` (from previous page's last item) for pagination.
 */
export async function getFeedPosts(
  limit: number,
  cursor?: FeedCursor
): Promise<{ data: FeedPost[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_feed_posts', {
    p_limit: limit,
    p_cursor_ts: cursor?.ts ?? null,
    p_cursor_id: cursor?.id ?? null,
  });

  if (error) return { data: null, error: new Error(error.message) };
  if (!data) return { data: [], error: null };

  // RPC returns flat rows; reshape into FeedPost (nested profiles object)
  const mapped: FeedPost[] = (data as NonNullable<typeof data>).map(
    (row: Database['public']['Functions']['get_feed_posts']['Returns'][number]) => ({
      id: row.id,
      user_id: row.user_id,
      image_url: row.image_url,
      pov_image_url: row.pov_image_url,
      caption: row.caption,
      streak_day: row.streak_day,
      created_at: row.created_at,
      like_count: row.like_count ?? 0,
      comment_count: row.comment_count ?? 0,
      liked_by_me: row.liked_by_me ?? false,
      tagged_users: row.tagged_users,
      profiles: {
        id: row.profile_id,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
      },
    })
  );

  // Response times are extra detail: a failure here must not hide the feed.
  const { data: responses } = await getPostResponses(mapped.map((p) => p.id));
  const byPost = new Map((responses ?? []).map((r) => [r.post_id, r]));
  for (const post of mapped) {
    const r = byPost.get(post.id);
    post.response = r ? { tagger_username: r.tagger_username, seconds: r.seconds } : null;
  }

  return { data: mapped, error: null };
}

/**
 * Fetch the distinct dates on which a user posted, from `since` onwards.
 * Used by the streak accountability grid.
 */
export async function getPostDates(
  userId: string,
  since: string // ISO 'YYYY-MM-DD'
): Promise<{ data: string[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('posts')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) return { data: null, error: new Error(error.message) };
  if (!data) return { data: [], error: null };

  // Use local date to match the grid's local-time cell rendering
  const dates = [
    ...new Set(
      (data as { created_at: string }[]).map((r) => {
        const d = new Date(r.created_at);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      })
    ),
  ];
  return { data: dates, error: null };
}

export type ProfilePostCursor = { ts: string; id: string };

/**
 * Fetch a page of posts for a specific user, newest first.
 * Used by the profile media canvas — no profiles join needed.
 */
export async function getUserPosts(
  userId: string,
  limit = 30,
  cursor?: ProfilePostCursor
): Promise<{ data: PostRow[] | null; error: Error | null }> {
  let query = supabase
    .from('posts')
    .select('id, user_id, image_url, pov_image_url, caption, streak_day, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query;
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as PostRow[], error: null };
}

export type AnsweredTag = { tagger_id: string; username: string; seconds: number };

export type CreatePostResult = {
  post: PostRow;
  streak: StreakResult;
  /** Tags this post answered, oldest first. */
  answered: AnsweredTag[];
  /** True when the same clientId had already been posted (a retry). */
  replayed: boolean;
};

/**
 * Upload the two photos for a post to `posts/{userId}/{clientId}_*.jpg`.
 * `upsert` makes a retry with the same clientId overwrite instead of duplicating.
 */
export async function uploadPostPhotos(opts: {
  userId: string;
  clientId: string;
  rear: ArrayBuffer;
  front: ArrayBuffer;
}): Promise<{ data: { rearPath: string; frontPath: string } | null; error: Error | null }> {
  const rearPath = `${opts.userId}/${opts.clientId}_rear.jpg`;
  const frontPath = `${opts.userId}/${opts.clientId}_pov.jpg`;
  const bucket = supabase.storage.from('posts');
  const [rear, front] = await Promise.all([
    bucket.upload(rearPath, opts.rear, { contentType: 'image/jpeg', upsert: true }),
    bucket.upload(frontPath, opts.front, { contentType: 'image/jpeg', upsert: true }),
  ]);
  const err = rear.error ?? front.error;
  if (err) return { data: null, error: new Error(err.message) };
  return { data: { rearPath, frontPath }, error: null };
}

/** Remove uploaded photos after a post failed. Best effort. */
export async function removePostPhotos(paths: string[]): Promise<void> {
  if (paths.length) await supabase.storage.from('posts').remove(paths);
}

/**
 * Create a post in ONE server call: the server dates it, records the streak, saves the
 * tags with their 48-hour deadlines, queues the pushes, and answers any tags waiting for
 * this user. Retrying with the same `clientId` returns the same post.
 *
 * Errors: "already posted today"; "tag N friends" (not enough tags); "cannot tag that
 * person"; "photo not found".
 */
export async function createPost(opts: {
  clientId: string;
  imagePath: string;
  povImagePath?: string | null;
  caption?: string | null;
  taggedUserIds?: string[];
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{ data: CreatePostResult | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_post', {
    p_client_id: opts.clientId,
    p_image_path: opts.imagePath,
    p_pov_image_path: opts.povImagePath ?? null,
    p_caption: opts.caption ?? null,
    p_tagged_ids: opts.taggedUserIds ?? [],
    p_latitude: opts.latitude ?? null,
    p_longitude: opts.longitude ?? null,
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as CreatePostResult, error: null };
}
