/**
 * How many slots (tags plus invites) the next post must fill — the same rule create_post enforces.
 */
export function requiredTagCount(
  rules: { tagCount: number; tagsRequired: boolean; inviteLinksEnabled: boolean },
  availableFriends: number
): number {
  if (!rules.tagsRequired) return 0;
  // With invite links on, an invite can fill any slot friends can't.
  if (rules.inviteLinksEnabled) return rules.tagCount;
  return Math.min(rules.tagCount, availableFriends);
}

/**
 * Why a friend is greyed out in the tag list; null when they can be tagged. Your own tag on them
 * ends when they post or its 48 hours run out (the server's taggable_friends rule).
 */
export function cantTagReason(friend: { has_open_tag: boolean; tagged_you?: boolean }): string | null {
  if (friend.tagged_you) return 'tagged you, can’t tag back';
  if (friend.has_open_tag) return 'you tagged them, free again when they post or their 48 hours end';
  return null;
}
