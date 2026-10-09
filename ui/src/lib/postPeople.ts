/**
 * The people on a post beyond its poster (core workflow, owner 2026-10-09):
 * - step 21: who the post replies to, "Replying to @joe, @sam.", from the server's
 *   `answered_taggers` (oldest first), falling back to the older single `answered` / `response`;
 * - step 13: link invites nobody has joined from yet (`pending_invites`), each a grey circle with
 *   initials and "Invited ⏳". The server sends initials only, never a name or number.
 * A field an older server doesn't send reads as empty.
 *
 * Pure and import-free so it runs under the node-only jest harness.
 */

export type ReplyPerson = { user_id: string | null; username: string };

export function replyingTo(post: {
  answered_taggers?: { user_id: string; username: string }[] | null;
  answered?: { tagger_username: string } | null;
  response?: { tagger_username: string } | null;
}): ReplyPerson[] {
  const taggers = post.answered_taggers ?? [];
  if (taggers.length > 0) {
    const seen = new Set<string>();
    return taggers
      .filter((t) => !seen.has(t.user_id) && !!seen.add(t.user_id))
      .map((t) => ({ user_id: t.user_id, username: t.username }));
  }
  // `answered: null` is the newer server saying the post answered nothing.
  const name =
    post.answered !== undefined ? post.answered?.tagger_username : post.response?.tagger_username;
  return name ? [{ user_id: null, username: name }] : [];
}

/** "Replying to @joe, @sam."; null with no one. */
export function replyingToText(usernames: string[]): string | null {
  if (usernames.length === 0) return null;
  return `Replying to ${usernames.map((u) => `@${u}`).join(', ')}.`;
}

export function pendingInvites(post: {
  pending_invites?: { initials: string | null }[] | null;
}): { key: string; initials: string | null }[] {
  return (post.pending_invites ?? []).map((invite, i) => ({
    key: `invite-${i}`,
    initials: invite.initials?.trim() || null,
  }));
}
