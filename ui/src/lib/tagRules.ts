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
 * Tags this post needs: the first workout needs no tags, whether the person arrived alone or
 * through a mate's tag. Every later answer needs `required` so accountability keeps moving.
 * `firstPost` is null until it's known, and then the usual rule holds. The server
 * (`20261008140000_first_workout_no_tags`) enforces the same.
 */
export function postTagsRequired(required: number, s: { firstPost: boolean | null }): number {
  return s.firstPost === true ? 0 : required;
}

/**
 * Why a friend is greyed out in the tag list; null when they can be tagged. Only your own open tag
 * on them blocks it: someone who tagged you can be tagged back (Maximus, 2026-10-07; the server's
 * taggable_friends rule, 20261007240000_tag_back).
 */
export function cantTagReason(friend: { has_open_tag: boolean }): string | null {
  if (friend.has_open_tag) return 'you tagged them, open until they answer';
  return null;
}
