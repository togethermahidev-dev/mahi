/**
 * The follow button on someone's profile: "Follow back" with "Follows you" above it when they
 * follow you and you don't follow them (owner, 2026-10-06; server: 20261006110000_follow_back).
 */
export function followButtonLabel(
  isFollowing: boolean,
  followsYou: boolean
): { label: string; followsYou: boolean } {
  if (isFollowing) return { label: 'Following', followsYou: false };
  if (followsYou) return { label: 'Follow back', followsYou: true };
  return { label: 'Follow', followsYou: false };
}
