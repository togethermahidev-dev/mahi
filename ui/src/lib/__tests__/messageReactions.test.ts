/**
 * Message reactions — the rules the chat follows before and after the server answers.
 *
 * Hold a message and pick an emoji: it shows at once (one reaction per person: the same emoji
 * again takes it off, a different one replaces it), then the server's own summary replaces the
 * guess. The "+" opens a keyboard: the first emoji typed is the reaction, letters are not.
 */
import {
  DOUBLE_TAP_EMOJI,
  QUICK_EMOJI,
  firstEmoji,
  messageHoldActions,
  myReaction,
  reactionsOf,
  toggleReaction,
  type ReactionSummary,
} from '@/lib/messageReactions';

const r = (emoji: string, count: number, mine = false): ReactionSummary => ({ emoji, count, mine });

describe('the quick row', () => {
  it('offers six different emoji, the heart among them', () => {
    expect(QUICK_EMOJI).toHaveLength(6);
    expect(new Set(QUICK_EMOJI).size).toBe(6);
    expect(QUICK_EMOJI).toContain(DOUBLE_TAP_EMOJI);
  });
});

describe('myReaction', () => {
  it('is the emoji I reacted with, or nothing', () => {
    expect(myReaction(undefined)).toBeNull();
    expect(myReaction([])).toBeNull();
    expect(myReaction([r('👍', 2), r('🔥', 1, true)])).toBe('🔥');
  });

  it('reactionsOf reads a message with or without the field', () => {
    expect(reactionsOf({})).toEqual([]);
    expect(reactionsOf({ reactions: [r('👍', 1)] })).toEqual([r('👍', 1)]);
  });
});

describe('toggleReaction (the guess shown before the server answers)', () => {
  it('adds a new emoji at the end, as mine', () => {
    expect(toggleReaction([r('👍', 1)], '🔥')).toEqual([r('👍', 1), r('🔥', 1, true)]);
  });

  it('joins an emoji someone else already used', () => {
    expect(toggleReaction([r('👍', 1)], '👍')).toEqual([r('👍', 2, true)]);
  });

  it('the same emoji again takes mine off; the pill goes when I was the only one', () => {
    expect(toggleReaction([r('👍', 2, true)], '👍')).toEqual([r('👍', 1)]);
    expect(toggleReaction([r('👍', 1, true), r('🔥', 1)], '👍')).toEqual([r('🔥', 1)]);
  });

  it('a different emoji replaces mine, keeping the order of what was there', () => {
    expect(toggleReaction([r('👍', 1, true), r('🔥', 1)], '🔥')).toEqual([r('🔥', 2, true)]);
    expect(toggleReaction([r('👍', 2, true), r('😂', 1)], '❤️')).toEqual([
      r('👍', 1),
      r('😂', 1),
      r('❤️', 1, true),
    ]);
  });

  it('leaves what it was given alone', () => {
    const before = [r('👍', 1, true)];
    toggleReaction(before, '👍');
    expect(before).toEqual([r('👍', 1, true)]);
  });
});

describe('firstEmoji (the "+" keyboard)', () => {
  it('is the first emoji typed, whole', () => {
    expect(firstEmoji('🔥')).toBe('🔥');
    expect(firstEmoji('❤️')).toBe('❤️');
    expect(firstEmoji('👍🏽 nice')).toBe('👍🏽');
    expect(firstEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    expect(firstEmoji('🇳🇿')).toBe('🇳🇿');
    expect(firstEmoji('go 💪')).toBe('💪');
  });

  it('is nothing for letters, digits or an empty field', () => {
    expect(firstEmoji('')).toBeNull();
    expect(firstEmoji('ok')).toBeNull();
    expect(firstEmoji('123')).toBeNull();
    expect(firstEmoji('   ')).toBeNull();
  });
});

describe('messageHoldActions (what the hold menu offers besides reacting)', () => {
  it('my message while it can still be edited: edit and unsend', () => {
    expect(messageHoldActions({ own: true, canEdit: true })).toEqual(['edit', 'unsend']);
  });

  it('my message once it cannot (15 minutes gone, or a waiting request): unsend only', () => {
    expect(messageHoldActions({ own: true, canEdit: false })).toEqual(['unsend']);
  });

  it('their message: nothing but the reactions', () => {
    expect(messageHoldActions({ own: false, canEdit: true })).toEqual([]);
  });
});
