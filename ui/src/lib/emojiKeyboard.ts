/**
 * The emoji button in each composer (comments, messages, captions) — pure rules, unit-tested.
 *
 * iPhone: the button switches the field to the phone's own emoji keyboard (with Apple's "Search
 * Emoji" bar) and back to letters. Android can't open the keyboard's own emoji page from an app,
 * so the button swaps the keyboard for an emoji panel the same height. The native side is the
 * local module ui/modules/mahi-emoji-keyboard (build 13+), loaded by
 * src/lib/emojiKeyboardModule.ts.
 */
import { EMOJI_PANEL } from '@/constants/tokens';

export interface EmojiKeyboardState {
  /** The emoji keyboard (iPhone) or emoji panel (Android) is showing. */
  emoji: boolean;
  /** Android: the letters are opening first; the panel follows once they're up. */
  waiting: boolean;
}

export const EMOJI_KEYBOARD_START: EmojiKeyboardState = { emoji: false, waiting: false };

export type EmojiKeyboardEvent =
  /** The emoji / letters button. `focused`: the field already has the cursor. */
  | { type: 'tap'; focused: boolean }
  /** The phone's keyboard (letters) came up. */
  | { type: 'keyboardShown' }
  /** The phone says which keyboard is up (iPhone: the person switched it themselves). */
  | { type: 'phoneSwitched'; emoji: boolean }
  /** The field lost the cursor. */
  | { type: 'blurred' };

/** What the composer does next: ask the native side for emoji or letters, or focus the field. */
export type EmojiKeyboardEffect = 'askEmoji' | 'askLetters' | 'focusInput';

export interface EmojiKeyboardStep {
  state: EmojiKeyboardState;
  effects: EmojiKeyboardEffect[];
}

const EMOJI_ON: EmojiKeyboardState = { emoji: true, waiting: false };

export function stepEmojiKeyboard(
  platform: string,
  state: EmojiKeyboardState,
  event: EmojiKeyboardEvent
): EmojiKeyboardStep {
  const same: EmojiKeyboardStep = { state, effects: [] };
  if (event.type === 'blurred') return { state: EMOJI_KEYBOARD_START, effects: [] };
  if (event.type === 'phoneSwitched') {
    return { state: event.emoji ? EMOJI_ON : EMOJI_KEYBOARD_START, effects: [] };
  }

  if (platform === 'ios') {
    if (event.type !== 'tap') return same;
    if (state.emoji) return { state: EMOJI_KEYBOARD_START, effects: ['askLetters'] };
    // Asked before the field opens, the keyboard comes up straight on emoji.
    return { state: EMOJI_ON, effects: event.focused ? ['askEmoji'] : ['askEmoji', 'focusInput'] };
  }

  // Android: the panel replaces the keyboard, so it waits for the letters to come and go.
  if (event.type === 'keyboardShown') {
    if (state.waiting) return { state: EMOJI_ON, effects: [] };
    return state.emoji ? { state: EMOJI_KEYBOARD_START, effects: [] } : same;
  }
  if (state.waiting) return same;
  if (state.emoji) return { state, effects: ['askLetters'] };
  if (!event.focused) return { state: { emoji: false, waiting: true }, effects: ['focusInput'] };
  return { state: EMOJI_ON, effects: [] };
}

/** Said when the iPhone has no Emoji keyboard turned on, so the button can't switch to it. */
export const EMOJI_KEYBOARD_OFF = 'Turn on the Emoji keyboard in Settings › General › Keyboard.';

/**
 * The help line on the "+" sheet (any emoji as a reaction). `emojiButton`: this build can open the
 * emoji keyboard itself (build 13+). `typedLetters`: something that isn't an emoji was typed.
 */
export function anyEmojiHelp({
  emojiButton,
  typedLetters,
}: {
  emojiButton: boolean;
  typedLetters: boolean;
}): string {
  if (typedLetters) return 'Pick an emoji.';
  return emojiButton
    ? 'Pick one from the emoji keyboard.'
    : 'Type one. The globe key on the keyboard opens the emoji.';
}

/** Android's panel height: the last keyboard's, so the composer stays where it was. */
export function emojiPanelHeight(lastKeyboardHeight: number | null): number {
  if (!lastKeyboardHeight) return EMOJI_PANEL.fallbackHeight;
  return Math.max(EMOJI_PANEL.minHeight, lastKeyboardHeight);
}

/**
 * Spread on every free-writing field (comments, messages, captions). With these on, the iPhone's
 * bar above the keys suggests words and emoji as you type, and Android keyboards can too. Search,
 * usernames, codes, emails and passwords keep them off.
 */
export const FREE_TEXT_PREDICTION = { autoCorrect: true, spellCheck: true } as const;
