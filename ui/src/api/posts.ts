/**
 * Posts API
 *
 * Handles feed post creation and retrieval.
 * Posts are created from the camera: a first post, then only to answer a friend's tag.
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/sentry';
import { forgetSavedMedia, withSavedMedia } from '@/lib/savedMedia';
import {
  mediaTypeArgs,
  mediaTypeOrPhoto,
  postMediaContentType,
  postMediaPath,
  type CapturedMediaRef,
  type MediaType,
} from '@/lib/videoPosts';
import type { Database } from '@/types';
import type { PostInvite } from './invites';
import type { AnswerTiming } from '@/lib/answerTiming';
import type { ProfileRestriction } from '@/lib/accountControls';

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
  /** The oldest tag this post answered, with time taken and time left (undefined: older server). */
  answered?: AnswerTiming | null;
  /** The poster's first ever post. */
  first_post?: boolean;
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
  /** Absent from servers before 20261002100000_video_posts, null while locked: a photo. */
  rear_media_type?: MediaType | null;
  front_media_type?: MediaType | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  tagged_users: TaggedUser[];
  response: { tagger_username: string; seconds: number } | null;
  /** Absent from servers before 20261007250000_answer_timing. */
  answered?: AnswerTiming | null;
  first_post?: boolean;
  profile: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

// Photo and video links last an hour; the feed re-reads before its unlock ends.
const SIGNED_URL_SECONDS = 3600;

// Supabase returns a different signed URL for the same file on every call. Native Image caches by
// URL, so regenerating them on every refresh made already-seen posts visibly load again. Keep each
// URL until shortly before it expires: refreshes stay instant while the server remains authoritative.
const SIGNED_URL_REUSE_MS = (SIGNED_URL_SECONDS - 300) * 1000;
const signedMedia = new Map<string, { url: string; reuseUntil: number }>();

function cachedSignedUrl(path: string, now: number): string | null {
  const cached = signedMedia.get(path);
  if (!cached || cached.reuseUntil <= now) {
    signedMedia.delete(path);
    return null;
  }
  return cached.url;
}

/** Turn server items into posts with short-lived signed photo / video URLs ('' when hidden). */
async function toPosts(items: FeedItem[]): Promise<FeedPost[]> {
  const paths = [
    ...new Set(
      items.flatMap((i) => [i.image_path, i.pov_image_path]).filter((p): p is string => !!p)
    ),
  ];
  const urls = new Map<string, string>();
  const now = Date.now();
  const missing: string[] = [];
  for (const path of paths) {
    const cached = cachedSignedUrl(path, now);
    if (cached) urls.set(path, cached);
    else missing.push(path);
  }
  if (missing.length) {
    const { data, error } = await supabase.storage
      .from('posts')
      .createSignedUrls(missing, SIGNED_URL_SECONDS);
    if (error) throw new Error(error.message, { cause: error });
    for (const d of data ?? []) {
      if (!d.path || !d.signedUrl) continue;
      urls.set(d.path, d.signedUrl);
      signedMedia.set(d.path, { url: d.signedUrl, reuseUntil: now + SIGNED_URL_REUSE_MS });
    }
  }
  const shown = await withSavedMedia(urls);
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
    image_url: (i.image_path && shown.get(i.image_path)) || '',
    pov_image_url: (i.pov_image_path && shown.get(i.pov_image_path)) || null,
    rear_media_type: mediaTypeOrPhoto(i.rear_media_type),
    front_media_type: mediaTypeOrPhoto(i.front_media_type),
    like_count: i.like_count,
    comment_count: i.comment_count,
    liked_by_me: i.liked_by_me,
    tagged_users: i.tagged_users,
    response: i.response,
    answered: i.answered,
    first_post: i.first_post,
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
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
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

export type ProfilePostCursor = { ts: string; id: string };

/**
 * A page of one person's posts, newest first, under the feed rule: another person's photos
 * come back with an empty `image_url` while the viewer is locked. Your own always show.
 */
export async function getUserPosts(
  userId: string,
  limit = 30,
  cursor?: ProfilePostCursor
): Promise<{
  data: FeedPost[] | null;
  error: Error | null;
  /** Their Controls hide their workouts from you (private accounts); null when you can see them. */
  restricted?: ProfileRestriction | null;
}> {
  const { data, error } = await supabase.rpc('get_user_posts', {
    p_user: userId,
    p_limit: limit,
    p_cursor_ts: cursor?.ts ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  try {
    const page = data as unknown as { items: FeedItem[]; restricted?: ProfileRestriction | null };
    return { data: await toPosts(page.items), error: null, restricted: page.restricted ?? null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export type AnsweredTag = { tagger_id: string; username: string; seconds: number };

/**
 * The `streak` part of the `create_post` result — Mahi points under the server's old names: each
 * post that answers a tag adds 1, missing a tag resets it to 0, and the best stays. Keep in sync
 * with the DB function.
 */
export interface PointsResult {
  streak_current: number;
  streak_highest: number;
}

export type CreatePostResult = {
  post: PostRow;
  streak: PointsResult;
  /** Tags this post answered, oldest first. */
  answered: AnsweredTag[];
  /** A link per slot filled by an invite, to share. Same links on a retry. */
  invites: PostInvite[];
  /** True when the same clientId had already been posted (a retry). */
  replayed: boolean;
};

/** One shot to upload: what it is (photo or video, and its local file) and its bytes. */
export type PostShotUpload = { shot: CapturedMediaRef; body: ArrayBuffer };

/**
 * Upload a post's two shots to `posts/{userId}/{clientId}_rear|_pov.{jpg|mov|mp4}` (photos keep
 * today's `.jpg` paths). `upsert` makes a retry with the same clientId overwrite instead of
 * duplicating.
 */
export async function uploadPostMedia(opts: {
  userId: string;
  clientId: string;
  rear: PostShotUpload;
  front: PostShotUpload;
}): Promise<{ data: { rearPath: string; frontPath: string } | null; error: Error | null }> {
  const rearPath = postMediaPath(opts.userId, opts.clientId, 'rear', opts.rear.shot);
  const frontPath = postMediaPath(opts.userId, opts.clientId, 'pov', opts.front.shot);
  const bucket = supabase.storage.from('posts');
  const [rear, front] = await Promise.all([
    bucket.upload(rearPath, opts.rear.body, {
      contentType: postMediaContentType(opts.rear.shot),
      upsert: true,
    }),
    bucket.upload(frontPath, opts.front.body, {
      contentType: postMediaContentType(opts.front.shot),
      upsert: true,
    }),
  ]);
  const err = rear.error ?? front.error;
  if (err) return { data: null, error: new Error(err.message, { cause: err }) };
  return { data: { rearPath, frontPath }, error: null };
}

/** Remove uploaded photos / videos after a post failed. Best effort. */
export async function removePostPhotos(paths: string[]): Promise<void> {
  for (const path of paths) signedMedia.delete(path);
  if (!paths.length) return;
  await forgetSavedMedia(paths);
  const { error } = await supabase.storage.from('posts').remove(paths);
  if (error) {
    reportError(error, {
      flow: 'posts',
      action: 'removePostPhotos',
      level: 'warning',
      extra: { count: paths.length, bucket: 'posts' },
    });
  }
}

/**
 * Create a post in ONE server call: the server dates it, records the points, saves the
 * tags with their 48-hour deadlines, queues the pushes, and answers any tags waiting for
 * this user. Retrying with the same `clientId` returns the same post.
 *
 * Errors: "reactive posting: not tagged" (no open tag and not a first post); "tag N
 * friends" (not enough tags); "cannot tag that person"; "photo not found"; "unsupported media";
 * "that invite is no longer open" when a selected invite ended before posting.
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
  /** Slots filled on the tag screen before posting (flag `tag-slots`). */
  slotIds?: string[];
  /** Each shot is a photo unless said otherwise. */
  rearMediaType?: MediaType;
  frontMediaType?: MediaType;
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
    // Only for a post with a video: a photo post makes exactly today's call.
    ...mediaTypeArgs(opts.rearMediaType ?? 'photo', opts.frontMediaType ?? 'photo'),
    // Only when there are slots: without them it is the call a server before tag slots knows.
    ...(opts.slotIds?.length ? { p_slot_ids: opts.slotIds } : {}),
  });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as CreatePostResult, error: null };
}

/** The server is authoritative: it accepts only the owner's caption during the first hour. */
export async function updatePostCaption(
  postId: string,
  caption: string
): Promise<{ data: { caption: string | null } | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('update_post_caption', {
    p_post: postId,
    p_caption: caption,
  });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as { caption: string | null }, error: null };
}

/** Delete the caller's post, then remove its media after the database confirms deletion. */
export async function deletePost(postId: string): Promise<{ error: Error | null }> {
  const { data, error } = await supabase.rpc('delete_post', { p_post: postId });
  if (error) return { error: new Error(error.message, { cause: error }) };
  const paths = [
    (data as { image_path?: string | null } | null)?.image_path,
    (data as { pov_image_path?: string | null } | null)?.pov_image_path,
  ].filter((path): path is string => !!path);
  if (paths.length) await removePostPhotos(paths);
  return { error: null };
}
