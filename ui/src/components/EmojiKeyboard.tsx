import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, type TextInput } from 'react-native';
import { EmojiIcon, KeyboardIcon } from '@/components/ScreenIcons';
import { ALPHA, ICON_SIZE, SIZE } from '@/constants/tokens';
import {
  EMOJI_KEYBOARD_OFF,
  EMOJI_KEYBOARD_START,
  emojiPanelHeight,
  stepEmojiKeyboard,
  type EmojiKeyboardEffect,
  type EmojiKeyboardEvent,
} from '@/lib/emojiKeyboard';
import {
  loadEmojiKeyboard,
  loadEmojiPanelView,
  type EmojiPanelHandle,
} from '@/lib/emojiKeyboardModule';
import { TAP_AREA, tapSlop } from '@/lib/tapArea';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useToastStore } from '@/store/toastStore';

/**
 * The emoji button in a composer, and (Android) the emoji panel that takes the keyboard's place.
 *
 *   const emoji = useEmojiKeyboard(inputRef);
 *   <TextInput ref={inputRef} onBlur={emoji.onBlur} … />
 *   <EmojiKeyboardButton emoji={emoji} color={muted} />
 *   …
 *   <EmojiPanel emoji={emoji} />   // just before <KeyboardInset />
 *
 * iPhone: the phone's own emoji keyboard (Apple's "Search Emoji" bar included). Android: Google's
 * emoji picker in the keyboard's place (no search). Builds without the native module (10 to 12)
 * show no button and no panel. Rules: src/lib/emojiKeyboard.ts.
 */

export interface EmojiKeyboardControl {
  /** This build has the native side: show the button. */
  available: boolean;
  /** Emoji is up: the button shows the keyboard icon. */
  on: boolean;
  toggle: () => void;
  /** Pass to the TextInput's onBlur. */
  onBlur: () => void;
  /** Android: the panel's ref (a callback, so the panel can live in another component). */
  setPanel: (panel: EmojiPanelHandle | null) => void;
  /** Android: the panel's height, 0 while the letters are still up (so nothing jumps). */
  panelHeight: number;
}

/** The last keyboard height seen on Android: the panel takes the same space. */
let lastKeyboardHeight: number | null = null;

export function useEmojiKeyboard(
  inputRef: React.RefObject<TextInput | null>
): EmojiKeyboardControl {
  const native = loadEmojiKeyboard();
  const android = Platform.OS === 'android';
  // `emoji-keyboard`: the owner's off switch (on for everyone, 2026-10-07).
  const switchOn = useFeatureFlag('emoji-keyboard');
  const available = switchOn && native != null && (!android || loadEmojiPanelView() != null);
  const [state, setState] = useState(EMOJI_KEYBOARD_START);
  const stateRef = useRef(state);
  const panelRef = useRef<EmojiPanelHandle | null>(null);
  const [lettersUp, setLettersUp] = useState(false);
  const setPanel = useCallback((panel: EmojiPanelHandle | null) => {
    panelRef.current = panel;
  }, []);

  /** Moves the state on; returns what to do next. */
  const step = useCallback((event: EmojiKeyboardEvent) => {
    const next = stepEmojiKeyboard(Platform.OS, stateRef.current, event);
    stateRef.current = next.state;
    setState(next.state);
    return next.effects;
  }, []);

  const dispatch = useCallback(
    (event: EmojiKeyboardEvent) => {
      // The native side couldn't do it: back to letters.
      const fallBack = () => {
        step({ type: 'phoneSwitched', emoji: false });
      };
      for (const effect of step(event)) run(effect);

      function run(effect: EmojiKeyboardEffect) {
        if (effect === 'focusInput') {
          inputRef.current?.focus();
        } else if (effect === 'askEmoji') {
          // False: the phone has no Emoji keyboard turned on; stay on letters, and say why.
          native
            ?.setEmojiMode(true)
            .then((ok) => {
              if (ok) return;
              fallBack();
              useToastStore.getState().show(EMOJI_KEYBOARD_OFF);
            })
            .catch(fallBack);
        } else if (android) {
          // The panel stays until the letters are up (keyboardDidShow), so nothing jumps.
          const panel = panelRef.current;
          if (!panel) return fallBack();
          panel
            .showLetters()
            .then((ok) => {
              if (!ok) fallBack();
            })
            .catch(fallBack);
        } else {
          native?.setEmojiMode(false).catch(() => {});
        }
      }
    },
    [android, inputRef, native, step]
  );

  // The phone's keyboard: Android's letters coming back close the panel; iPhone's globe key
  // switching keyboards updates the button.
  useEffect(() => {
    if (!available) return;
    const subs: { remove(): void }[] = [];
    if (android) {
      subs.push(
        Keyboard.addListener('keyboardDidShow', (e) => {
          lastKeyboardHeight = e.endCoordinates.height;
          setLettersUp(true);
          if (inputRef.current?.isFocused()) dispatch({ type: 'keyboardShown' });
        }),
        Keyboard.addListener('keyboardDidHide', () => setLettersUp(false))
      );
    } else if (native) {
      subs.push(
        native.addListener('onEmojiModeChange', ({ emoji }) => {
          if (inputRef.current?.isFocused()) dispatch({ type: 'phoneSwitched', emoji });
        })
      );
    }
    return () => subs.forEach((s) => s.remove());
  }, [android, available, dispatch, inputRef, native]);

  const toggle = useCallback(
    () => dispatch({ type: 'tap', focused: inputRef.current?.isFocused() ?? false }),
    [dispatch, inputRef]
  );
  const onBlur = useCallback(() => dispatch({ type: 'blurred' }), [dispatch]);

  return {
    available,
    on: state.emoji,
    toggle,
    onBlur,
    setPanel,
    panelHeight: lettersUp ? 0 : emojiPanelHeight(lastKeyboardHeight),
  };
}

// Drawn as tall as the composers' one-line fields; the tap area grows to 44 (Android 48).
const SLOP = tapSlop(SIZE.z36, Platform.OS === 'android' ? TAP_AREA.android : TAP_AREA.ios);

/** Emoji ↔ letters. Nothing on a build without the native side. */
export function EmojiKeyboardButton({
  emoji,
  color,
}: {
  emoji: EmojiKeyboardControl;
  color: string;
}): React.JSX.Element | null {
  if (!emoji.available) return null;
  const Icon = emoji.on ? KeyboardIcon : EmojiIcon;
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={emoji.toggle}
      hitSlop={SLOP}
      accessibilityRole="button"
      accessibilityLabel={emoji.on ? 'Letters keyboard' : 'Emoji keyboard'}
    >
      <Icon size={ICON_SIZE.i24} color={color} />
    </Pressable>
  );
}

// Looked up once, when the composers load: a null-safe probe, never a crash on builds 10 to 12.
const NativePanel = loadEmojiPanelView();

/** Android's emoji panel, in the keyboard's place: just before the composer's KeyboardInset. */
export function EmojiPanel({ emoji }: { emoji: EmojiKeyboardControl }): React.JSX.Element | null {
  const { available, on, setPanel, panelHeight } = emoji;
  if (!NativePanel || !available || !on) return null;
  return <NativePanel ref={setPanel} style={{ height: panelHeight }} />;
}

const styles = StyleSheet.create({
  button: {
    width: SIZE.z36,
    height: SIZE.z36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: ALPHA.a70 },
});
