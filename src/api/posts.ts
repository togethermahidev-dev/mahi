/**
 * Posts API
 *
 * Handles feed post creation and retrieval.
 * Posts are created when a user takes their daily streak photo.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types';

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

/**
 * Insert a new post record after a successful camera upload.
 * If `taggedUserIds` is provided, inserts corresponding rows into `post_tags`
 * after the post is created. RLS on `post_tags` verifies caller owns the post.
 *
 * `latitude`/`longitude` are optional per-post coordinates (explicit opt-in in
 * the camera flow). They are only set when both are provided; otherwise the
 * columns are left null so location-less posts stay valid. Coordinates are
 * already rounded to ~city-block precision by `src/lib/location.ts` before they
 * reach this layer — do NOT round again here. Anyone who can read the post can
 * read its coordinates (they inherit the post's existing public read RLS).
 */
export async function createPost(opts: {
  userId: string;
  imageUrl: string;
  streakDay: number;
  caption?: string;
  povImageUrl?: string;
  taggedUserIds?: string[];
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{ data: PostRow | null; error: Error | null }> {
  const { userId, imageUrl, streakDay, caption, povImageUrl, taggedUserIds, latitude, longitude } =
    opts;
  // Only attach coordinates when BOTH are present — a half-set fix is dropped to
  // null so we never persist a lone lat or lng. `?? null` normalises undefined.
  const hasCoords = latitude != null && longitude != null;
  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      image_url: imageUrl,
      streak_day: streakDay,
      caption,
      pov_image_url: povImageUrl ?? null,
      latitude: hasCoords ? latitude : null,
      longitude: hasCoords ? longitude : null,
    })
    .select()
    .single();

  if (error) return { data: null, error: new Error(error.message) };

  if (data && taggedUserIds && taggedUserIds.length > 0) {
    const uniqueIds = Array.from(new Set(taggedUserIds));
    const rows = uniqueIds.map((uid) => ({ post_id: data.id, user_id: uid }));
    const { error: tagErr } = await supabase.from('post_tags').insert(rows);
    if (tagErr) {
      return { data, error: new Error(`post created but tag insert failed: ${tagErr.message}`) };
    }
  }

  return { data, error: null };
}
