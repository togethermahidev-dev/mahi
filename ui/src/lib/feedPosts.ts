/**
 * The feed is the people you follow, newest first; of your own posts it shows only your latest,
 * in its place by time (owner, 2026-10-07). Your older posts live on your Profile. The list
 * arrives newest first, so your first post in it is your latest.
 */
export function latestOwnPostOnly<T extends { profiles: { id: string } }>(
  posts: T[],
  myId: string | undefined
): T[] {
  if (!myId) return posts;
  let seenOwn = false;
  return posts.filter((p) => {
    if (p.profiles.id !== myId) return true;
    if (seenOwn) return false;
    seenOwn = true;
    return true;
  });
}
