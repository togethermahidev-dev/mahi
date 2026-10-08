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
