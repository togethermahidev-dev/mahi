/**
 * The "Invite 3 friends" step in the tag sheet (owner's call 2026-10-01; standard since 2026-10-07).
 * Every answer after the first workout fills its tag slots; the first workout needs no tags, so the
 * camera doesn't offer the tag sheet then. An invite link fills any required slot friends can't (the
 * server rule in tagRules.ts). When friends can't fill the slots, the sheet leads with a plain
 * invite step instead of a short list. Someone who tagged you can be tagged back
 * (20261007240000_tag_back).
 *
 * Pure (it imports only the pure tagSlots words) so it runs under the node-only jest harness.
 */
import { INVITE_BUTTON } from '@/lib/tagSlots';

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
  const how =
    'When someone accepts your invite, you’ll automatically follow each other. They’ll get 48 hours to answer with any workout. A walk counts.';
  return {
    headline: `Invite ${count(toInvite, 'friend', 'friends')} to show up`,
    why: `Each answer challenges ${maxTags} friends. ${how}`,
    button: canAdd ? INVITE_BUTTON : `All ${maxTags} tags used`,
    canAdd,
    count: slots.text,
  };
}
