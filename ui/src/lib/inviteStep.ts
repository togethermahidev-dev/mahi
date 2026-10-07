/**
 * The "Invite 3 friends" step in the tag sheet (owner's call 2026-10-01; standard since 2026-10-07).
 * Every post fills its tag slots; an invite link fills any slot friends can't (the server rule in
 * tagRules.ts). A newcomer invited by a friend can't tag that friend back, so they start with no
 * one to tag — the sheet then leads with a plain invite step instead of an empty list.
 *
 * Pure and import-free so it runs under the node-only jest harness.
 */

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Slots filled by friends and invites together, and the line that says so. */
export function slotCount({
  maxTags,
  friends,
  invites,
}: {
  maxTags: number;
  friends: number;
  invites: number;
}): { filled: number; remaining: number; total: number; text: string } {
  const filled = friends + invites;
  const parts = [
    friends > 0 ? count(friends, 'friend', 'friends') : null,
    invites > 0 ? count(invites, 'link', 'links') : null,
  ].filter(Boolean);
  return {
    filled,
    remaining: Math.max(0, maxTags - filled),
    total: maxTags,
    text: `${filled} of ${maxTags} tags${parts.length ? ` · ${parts.join(', ')}` : ''}`,
  };
}

/**
 * What the tag sheet leads with. `availableFriends` is how many friends can be tagged right now
 * (null until the list has loaded). Picking from a caption `@` always shows the friends list.
 */
export function tagSheetStep({
  singleShot,
  availableFriends,
  maxTags,
}: {
  singleShot: boolean;
  availableFriends: number | null;
  maxTags: number;
}): 'invite' | 'friends' | 'loading' {
  if (singleShot) return 'friends';
  if (availableFriends === null) return 'loading';
  return availableFriends < maxTags ? 'invite' : 'friends';
}

/** The words on the invite step. */
export function inviteStepCopy({
  maxTags,
  availableFriends,
  friends,
  invites,
}: {
  maxTags: number;
  availableFriends: number;
  friends: number;
  invites: number;
}): { headline: string; why: string; button: string; canAdd: boolean; count: string } {
  const toInvite = Math.max(1, maxTags - Math.min(availableFriends, maxTags));
  const slots = slotCount({ maxTags, friends, invites });
  const canAdd = slots.remaining > 0;
  return {
    headline: `Invite ${count(toInvite, 'mate', 'mates')} to post`,
    why: `Every post tags ${maxTags} mates. When someone accepts your invite, you’ll automatically follow each other. They’ll get 48 hours to answer with any workout. A walk counts.`,
    button: canAdd ? 'Invite a friend' : `All ${maxTags} tags used`,
    canAdd,
    count: slots.text,
  };
}
