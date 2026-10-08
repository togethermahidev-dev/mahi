/**
 * The question before unfollowing (tagging no longer needs a mutual follow, so it doesn't say
 * you can't tag each other): a friend stops being one; a private account needs asking again.
 */
export function unfollowConfirm(
  handle: string,
  them: { followsYou: boolean; isPrivate: boolean }
): { title: string; message: string | undefined } {
  const lines = [
    them.followsYou ? 'You’ll stop being friends.' : null,
    them.isPrivate ? 'You’ll need to ask again to see their workouts.' : null,
  ].filter(Boolean);
  return { title: `Unfollow ${handle}?`, message: lines.length ? lines.join(' ') : undefined };
}

/**
 * A follow that failed, in plain words: the server's daily cap on new follow requests (100 a
 * day), or the screen's own `fallback` for anything else.
 */
export function followErrorText(message: string, fallback: string): string {
  if (message.includes('too many follow requests')) {
    return 'You’ve sent a lot of follow requests today. Try again tomorrow.';
  }
  return fallback;
}

/**
 * The follow button on someone's profile: "Follow back" with "Follows you" above it when they
 * follow you and you don't follow them (owner, 2026-10-06; server: 20261006110000_follow_back).
 * "Requested" while your follow request to a private account waits; a tap takes it back
 * (20261008170000_private_accounts — no switch: the server may answer `requested` any time).
 */
export function followButtonLabel(
  isFollowing: boolean,
  followsYou: boolean,
  requested = false
): { label: string; followsYou: boolean } {
  if (isFollowing) return { label: 'Following', followsYou: false };
  if (requested) return { label: 'Requested', followsYou: false };
  if (followsYou) return { label: 'Follow back', followsYou: true };
  return { label: 'Follow', followsYou: false };
}
