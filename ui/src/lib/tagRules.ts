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
 * The first post tags exactly one mate (core workflow, 2026-10-09). A constant, never read from
 * app_config, so this app also works on a server that still allows 0–3 on a first post.
 */
export const FIRST_POST_TAGS = 1;

/**
 * Tags this post needs: the first post tags `FIRST_POST_TAGS`, whether the person arrived alone or
 * through a mate's tag; every answer needs `required`. `firstPost` is null until it's known, and
 * then the answer rule holds. The server's create_post enforces the same.
 */
export function postTagsRequired(required: number, s: { firstPost: boolean | null }): number {
  return s.firstPost === true ? FIRST_POST_TAGS : required;
}

/** The most people the camera lets you tag: one on the first post, otherwise the tag count. */
export function maxTagsFor(firstPost: boolean | null, tagCount: number): number {
  return firstPost === true ? FIRST_POST_TAGS : Math.max(tagCount, 1);
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
