/**
 * Message reactions (owner, 2026-10-07: hold a message to react with an emoji, as PingMee-v2).
 *
 * Pure rules, unit-tested; nothing native here. The server (react_to_message) is the truth:
 * one reaction per person per message, the same emoji again takes it off, a different one
 * replaces it. `toggleReaction` is the chat's guess shown the moment you pick, until the
 * server's own summary comes back and replaces it (or the guess is rolled back if it refused).
 */
/** One emoji on a message: how many people picked it, and whether I'm one of them. */
export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
}

/** The quick row a held message offers — fitness-flavoured, the heart among them. */
export const QUICK_EMOJI = ['👍', '❤️', '😂', '🔥', '💪', '👏'] as const;

/** A double tap on a message is a heart (the common pattern). */
export const DOUBLE_TAP_EMOJI = '❤️';

/** A message's reactions, with or without the field (an older server sends none). */
export function reactionsOf(message: { reactions?: ReactionSummary[] | null }): ReactionSummary[] {
  return message.reactions ?? [];
}

/** The emoji I reacted with, or null. */
export function myReaction(reactions: ReactionSummary[] | undefined): string | null {
  return reactions?.find((r) => r.mine)?.emoji ?? null;
}

/**
 * What the reactions look like once I pick `emoji`, before the server answers. The same emoji
 * again takes mine off; a different one moves mine. A pill that reaches zero goes; a new emoji
 * joins at the end, as the server orders them (first reaction first). Never changes its input.
 */
export function toggleReaction(reactions: ReactionSummary[], emoji: string): ReactionSummary[] {
  const mine = myReaction(reactions);
  const withoutMine = reactions
    .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : { ...r }))
    .filter((r) => r.count > 0);
  if (mine === emoji) return withoutMine;
  const joined = withoutMine.find((r) => r.emoji === emoji);
  if (joined) {
    return withoutMine.map((r) => (r === joined ? { ...r, count: r.count + 1, mine: true } : r));
  }
  return [...withoutMine, { emoji, count: 1, mine: true }];
}

/**
 * The first emoji in some typed text, whole (a skin tone, a flag, a family joined with ZWJ stay
 * together), or null when there is none. The "+" opens a keyboard: the first emoji typed is the
 * reaction; letters and digits are not.
 */
const EMOJI_PART = '\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?';
const EMOJI = new RegExp(
  `\\p{Regional_Indicator}{2}|${EMOJI_PART}(?:\\u200D${EMOJI_PART})*|[#*0-9]\\uFE0F?\\u20E3`,
  'u'
);
export function firstEmoji(text: string): string | null {
  return EMOJI.exec(text)?.[0] ?? null;
}

export type MessageHoldAction = 'edit' | 'unsend';

/**
 * What the hold menu offers besides the reactions: my own message can be edited while
 * `canEdit` (fresh — `canStillEdit` — and I can still send here) and unsent any time; theirs
 * offers nothing more.
 */
export function messageHoldActions(input: { own: boolean; canEdit: boolean }): MessageHoldAction[] {
  if (!input.own) return [];
  return input.canEdit ? ['edit', 'unsend'] : ['unsend'];
}
