/**
 * A post inside a chat (owner, 2026-10-10): `share_post` sends a post to friends as a message, and
 * `get_messages` hands it back as `post` beside `post_id`. A shared post follows the same
 * who-can-see rules as anywhere else, with no exception: the server says when it can't be shown.
 *
 * Pure rules (no imports) so they run under the node-only jest harness.
 */

/** Why a shared post can't be shown. `error` is the app's own: its photo link couldn't be made. */
export type SharedPostReason = 'locked' | 'private' | 'gone' | 'error';

/** `post` on a message as the server sends it: the feed item, or why not. */
export type RawSharedPost =
  | { id: string; available: true; item: Record<string, unknown> }
  | { id: string; available: false; reason: Exclude<SharedPostReason, 'error'> };

const UNAVAILABLE: Record<SharedPostReason, string> = {
  locked: 'Post your Mahi to see this post.',
  private: 'This post is private.',
  gone: 'This post is no longer available.',
  error: 'Couldn’t load this post.',
};

/** The words in place of the photo. */
export function sharedPostUnavailableText(reason: SharedPostReason): string {
  return UNAVAILABLE[reason];
}

/**
 * Read `post` off a message. Nothing there (a plain message, or a server before shared posts):
 * null. A reason this update doesn't know, or "available" with no item, reads as gone.
 */
export function readSharedPost(raw: unknown): RawSharedPost | null {
  if (!raw || typeof raw !== 'object') return null;
  const post = raw as { id?: unknown; available?: unknown; item?: unknown; reason?: unknown };
  if (typeof post.id !== 'string') return null;
  if (post.available === true && post.item && typeof post.item === 'object') {
    return { id: post.id, available: true, item: post.item as Record<string, unknown> };
  }
  const reason = post.reason === 'locked' || post.reason === 'private' ? post.reason : 'gone';
  return { id: post.id, available: false, reason };
}

type PostMessageWords = { content: string; post_id?: string | null };

/**
 * A message as one line of words: the inbox's last message, and the plain bubble when the
 * `share-sheet` switch is off. A post with no note reads "Sent a post" (as `get_inbox` does).
 */
export function messagePreviewText(message: PostMessageWords): string {
  return message.post_id && !message.content.trim() ? 'Sent a post' : message.content;
}

/** Hold menu: a post sent with no note has no words to edit (it can still be unsent). */
export function messageWordsEditable(message: PostMessageWords): boolean {
  return !(message.post_id && !message.content.trim());
}
