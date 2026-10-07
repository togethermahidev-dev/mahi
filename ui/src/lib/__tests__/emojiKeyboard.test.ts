import { readFileSync } from 'fs';
import { join } from 'path';
import { EMOJI_PANEL } from '@/constants/tokens';
import {
  EMOJI_KEYBOARD_START,
  FREE_TEXT_PREDICTION,
  emojiPanelHeight,
  stepEmojiKeyboard,
  type EmojiKeyboardState,
} from '../emojiKeyboard';

const letters: EmojiKeyboardState = EMOJI_KEYBOARD_START;
const emoji: EmojiKeyboardState = { emoji: true, waiting: false };

describe('stepEmojiKeyboard on iPhone — the phone’s own emoji keyboard', () => {
  it('starts on letters', () => {
    expect(EMOJI_KEYBOARD_START).toEqual({ emoji: false, waiting: false });
  });

  it('a tap while typing asks the phone for its emoji keyboard', () => {
    expect(stepEmojiKeyboard('ios', letters, { type: 'tap', focused: true })).toEqual({
      state: emoji,
      effects: ['askEmoji'],
    });
  });

  it('a tap before typing asks for emoji first, then opens the keyboard', () => {
    expect(stepEmojiKeyboard('ios', letters, { type: 'tap', focused: false })).toEqual({
      state: emoji,
      effects: ['askEmoji', 'focusInput'],
    });
  });

  it('a tap on emoji goes back to letters', () => {
    expect(stepEmojiKeyboard('ios', emoji, { type: 'tap', focused: true })).toEqual({
      state: letters,
      effects: ['askLetters'],
    });
  });

  it('follows the phone when the person switches keyboards themselves', () => {
    expect(stepEmojiKeyboard('ios', emoji, { type: 'phoneSwitched', emoji: false }).state).toEqual(
      letters
    );
    expect(stepEmojiKeyboard('ios', letters, { type: 'phoneSwitched', emoji: true }).state).toEqual(
      emoji
    );
  });

  it('the keyboard showing changes nothing', () => {
    expect(stepEmojiKeyboard('ios', emoji, { type: 'keyboardShown' })).toEqual({
      state: emoji,
      effects: [],
    });
  });

  it('leaving the field starts again on letters', () => {
    expect(stepEmojiKeyboard('ios', emoji, { type: 'blurred' })).toEqual({
      state: letters,
      effects: [],
    });
  });
});

describe('stepEmojiKeyboard on Android — the emoji panel in place of the keyboard', () => {
  it('a tap while typing shows the panel (it hides the letters itself)', () => {
    expect(stepEmojiKeyboard('android', letters, { type: 'tap', focused: true })).toEqual({
      state: emoji,
      effects: [],
    });
  });

  it('a tap before typing opens the keyboard first, then the panel once it is up', () => {
    const first = stepEmojiKeyboard('android', letters, { type: 'tap', focused: false });
    expect(first).toEqual({ state: { emoji: false, waiting: true }, effects: ['focusInput'] });
    expect(stepEmojiKeyboard('android', first.state, { type: 'keyboardShown' })).toEqual({
      state: emoji,
      effects: [],
    });
  });

  it('a second tap while waiting does nothing', () => {
    const waiting = { emoji: false, waiting: true };
    expect(stepEmojiKeyboard('android', waiting, { type: 'tap', focused: true })).toEqual({
      state: waiting,
      effects: [],
    });
  });

  it('a tap on emoji asks for letters but keeps the panel until they are up (no jump)', () => {
    const tapped = stepEmojiKeyboard('android', emoji, { type: 'tap', focused: true });
    expect(tapped).toEqual({ state: emoji, effects: ['askLetters'] });
    expect(stepEmojiKeyboard('android', tapped.state, { type: 'keyboardShown' }).state).toEqual(
      letters
    );
  });

  it('the letters coming back any other way (a tap in the field) closes the panel', () => {
    expect(stepEmojiKeyboard('android', emoji, { type: 'keyboardShown' }).state).toEqual(letters);
  });

  it('letters that could not show close the panel anyway', () => {
    expect(
      stepEmojiKeyboard('android', emoji, { type: 'phoneSwitched', emoji: false }).state
    ).toEqual(letters);
  });

  it('leaving the field closes everything', () => {
    expect(
      stepEmojiKeyboard('android', { emoji: false, waiting: true }, { type: 'blurred' })
    ).toEqual({ state: letters, effects: [] });
  });
});

describe('emojiPanelHeight — the panel takes the keyboard’s place', () => {
  it('matches the last keyboard height', () => {
    expect(emojiPanelHeight(312)).toBe(312);
  });

  it('uses the standard height before any keyboard has shown', () => {
    expect(emojiPanelHeight(null)).toBe(EMOJI_PANEL.fallbackHeight);
    expect(emojiPanelHeight(0)).toBe(EMOJI_PANEL.fallbackHeight);
  });

  it('never gets too small to pick from', () => {
    expect(emojiPanelHeight(EMOJI_PANEL.minHeight / 2)).toBe(EMOJI_PANEL.minHeight);
  });
});

describe('predictive text in the places people write freely', () => {
  it('turns prediction and spell check on (iPhone suggests emoji in the bar above the keys)', () => {
    expect(FREE_TEXT_PREDICTION).toEqual({ autoCorrect: true, spellCheck: true });
  });

  // Comments, messages and captions. Search, usernames, codes, emails and passwords keep it off.
  const root = join(__dirname, '..', '..', '..');
  it.each([
    'src/components/CommentSheet.tsx',
    'src/screens/ConversationScreen.tsx',
    'src/components/EditPostCaptionSheet.tsx',
    'src/screens/CameraScreen.tsx',
  ])('%s: the writing field has prediction on and nothing that blocks it', (file) => {
    const source = readFileSync(join(root, file), 'utf8');
    expect(source).toContain('{...FREE_TEXT_PREDICTION}');
    // Each field that spreads it sets nothing after it that turns suggestions off.
    for (const field of source.split('{...FREE_TEXT_PREDICTION}').slice(1)) {
      const rest = field.slice(0, field.indexOf('/>'));
      expect(rest).not.toMatch(/autoCorrect=\{false\}|spellCheck=\{false\}|keyboardType=/);
    }
  });
});
