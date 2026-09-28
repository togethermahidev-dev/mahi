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
