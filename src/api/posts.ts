/**
 * Posts API
 *
 * Handles feed post creation and retrieval.
 * Posts are created when a user takes their daily streak photo.
 */

import { supabase } from '@/lib/supabase';
import type { Database } from '@/types';
import type { StreakResult } from './streaks';
import type { PostInvite } from './invites';

type PostRow = Database['public']['Tables']['posts']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type TaggedUser = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type FeedPost = PostRow & {
  profiles: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> & { points?: number };
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  tagged_users: TaggedUser[];
  /** Set when this post answered a tag: whose, and how fast (oldest tag). */
  response?: { tagger_username: string; seconds: number } | null;
  /** The server hid this post's photos and caption (viewer hasn't posted in 24 h). */
  locked: boolean;
};

export type FeedCursor = { ts: string; id: string };

export type FeedPage = {
  posts: FeedPost[];
  /** Friends' posts are hidden until the viewer posts. */
  locked: boolean;
  /** When the viewer's unlock ends (null = never posted). */
  unlockedUntil: string | null;
  /** server clock − device clock at read time. */
  serverOffsetMs: number;
};

/** One post as get_feed / get_user_posts return it (public.feed_item). */
type FeedItem = {
  id: string;
  user_id: string;
  created_at: string;
  post_date: string;
  streak_day: number;
  locked: boolean;
  image_path: string | null;
  pov_image_path: string | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  tagged_users: TaggedUser[];
  response: { tagger_username: string; seconds: number } | null;
  profile: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> & { points: number };
};

// Photo links last an hour; the feed re-reads before its unlock ends.
const SIGNED_URL_SECONDS = 3600;

/** Turn server items into posts with short-lived signed photo URLs ('' when hidden). */
async function toPosts(items: FeedItem[]): Promise<FeedPost[]> {
  const paths = items.flatMap((i) => [i.image_path, i.pov_image_path]).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data, error } = await supabase.storage
      .from('posts')
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw new Error(error.message);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return items.map((i) => ({
    id: i.id,
    user_id: i.user_id,
    created_at: i.created_at,
    post_date: i.post_date,
    streak_day: i.streak_day,
    caption: i.caption,
    latitude: i.latitude,
    longitude: i.longitude,
    client_id: null,
    image_path: i.image_path,
    pov_image_path: i.pov_image_path,
    image_url: (i.image_path && urls.get(i.image_path)) || '',
    pov_image_url: (i.pov_image_path && urls.get(i.pov_image_path)) || null,
    like_count: i.like_count,
    comment_count: i.comment_count,
    liked_by_me: i.liked_by_me,
    tagged_users: i.tagged_users,
    response: i.response,
    locked: i.locked,
    profiles: i.profile,
  }));
}

/**
 * A page of the feed: your posts and those of people you follow, newest first. The server
 * hides friends' photos and captions until you've posted in the last 24 hours.
 */
export async function getFeed(
  limit: number,
  cursor?: FeedCursor
): Promise<{ data: FeedPage | null; error: Error | null }> {
  const requestedAt = Date.now();
  const { data, error } = await supabase.rpc('get_feed', {
    p_limit: limit,
    p_cursor_ts: cursor?.ts ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) return { data: null, error: new Error(error.message) };
  const page = data as unknown as {
    locked: boolean;
    unlocked_until: string | null;
    server_now: string;
    items: FeedItem[];
  };
  try {
    return {
      data: {
        posts: await toPosts(page.items),
        locked: page.locked,
        unlockedUntil: page.unlocked_until,
        serverOffsetMs: new Date(page.server_now).getTime() - requestedAt,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
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
 * A page of one person's posts, newest first, under the feed rule: another person's photos
 * come back with an empty `image_url` while the viewer is locked. Your own always show.
 */
export async function getUserPosts(
  userId: string,
  limit = 30,
  cursor?: ProfilePostCursor
): Promise<{ data: FeedPost[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_user_posts', {
    p_user: userId,
    p_limit: limit,
    p_cursor_ts: cursor?.ts ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) return { data: null, error: new Error(error.message) };
  try {
    const page = data as unknown as { items: FeedItem[] };
    return { data: await toPosts(page.items), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export type AnsweredTag = { tagger_id: string; username: string; seconds: number };

export type CreatePostResult = {
  post: PostRow;
  streak: StreakResult;
  /** Tags this post answered, oldest first. */
  answered: AnsweredTag[];
  /** A link per slot filled by an invite, to share. Same links on a retry. */
  invites: PostInvite[];
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
  /** Slots filled by an invite link instead of a friend already on Mahi. */
  inviteCount?: number;
}): Promise<{ data: CreatePostResult | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_post', {
    p_client_id: opts.clientId,
    p_image_path: opts.imagePath,
    p_pov_image_path: opts.povImagePath ?? null,
    p_caption: opts.caption ?? null,
    p_invite_count: opts.inviteCount ?? 0,
    p_tagged_ids: opts.taggedUserIds ?? [],
    p_latitude: opts.latitude ?? null,
    p_longitude: opts.longitude ?? null,
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as CreatePostResult, error: null };
}
