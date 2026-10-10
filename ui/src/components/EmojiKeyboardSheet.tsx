import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import KeyboardInset from '@/components/KeyboardInset';
import ShortSheet from '@/components/ShortSheet';
import { EmojiKeyboardButton, EmojiPanel, useEmojiKeyboard } from '@/components/EmojiKeyboard';
import { anyEmojiHelp } from '@/lib/emojiKeyboard';
import { themeColors } from '@/hooks/useAppTheme';
import { firstEmoji } from '@/lib/messageReactions';
import { GLYPH, TYPOGRAPHY } from '@/constants/typography';
import { ALPHA, RADIUS, SIZE, SPACE } from '@/constants/tokens';

/**
 * Any emoji as a reaction (the hold menu's "+"): a field that opens the keyboard; the first emoji
 * typed is the reaction and the sheet closes. On build 13+ the iPhone opens straight on its own
 * emoji keyboard and the emoji button sits beside the field (Android: the emoji panel); older
 * builds have only the globe key. Letters typed get "Pick an emoji."
 */
export default function EmojiKeyboardSheet({
  dark,
  onPick,
  onClose,
}: {
  dark: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { bg, text, muted, border } = themeColors(dark);
  const [typed, setTyped] = useState('');
  const inputRef = useRef<TextInput>(null);
  const emoji = useEmojiKeyboard(inputRef);
  // iPhone, build 13+: open straight on the emoji keyboard (it focuses the field itself).
  const openOnEmoji = emoji.available && Platform.OS === 'ios';
  const opened = useRef(false);
  useEffect(() => {
    if (!openOnEmoji || opened.current) return;
    opened.current = true;
    emoji.toggle();
  }, [openOnEmoji, emoji]);
  const onChange = (value: string) => {
    const emoji = firstEmoji(value);
    if (emoji) {
      onPick(emoji);
      return;
    }
    setTyped(value);
  };
  return (
    <ShortSheet dark={dark} onDismiss={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: bg }]}>
          <Text style={[styles.title, { color: text }]}>Any emoji</Text>
          <Text style={[styles.help, { color: muted }]} accessibilityLiveRegion="polite">
            {anyEmojiHelp({ emojiButton: emoji.available, typedLetters: typed.trim() !== '' })}
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={typed}
              onChangeText={onChange}
              onBlur={emoji.onBlur}
              autoFocus={!openOnEmoji}
              maxLength={16}
              keyboardAppearance={dark ? 'dark' : 'light'}
              placeholder="Your emoji"
              placeholderTextColor={muted}
              accessibilityLabel="Emoji"
              style={[styles.input, { color: text, borderColor: border }]}
            />
            <EmojiKeyboardButton emoji={emoji} color={muted} />
          </View>
          <Pressable
            onPress={() => close()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text style={[styles.cancelText, { color: text }]}>Cancel</Text>
          </Pressable>
          <EmojiPanel emoji={emoji} />
          <KeyboardInset />
        </View>
      )}
    </ShortSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: RADIUS.r24,
    borderTopRightRadius: RADIUS.r24,
    padding: SPACE.s24,
    gap: SPACE.s12,
  },
  title: { ...TYPOGRAPHY.sheetTitle },
  help: { ...TYPOGRAPHY.small },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s8 },
  input: {
    // Inter Tight carries no emoji glyphs: the phone's own emoji font draws what is typed.
    ...GLYPH.emoji,
    flex: 1,
    minHeight: SIZE.z52,
    borderWidth: SIZE.z1,
    borderRadius: RADIUS.r16,
    paddingHorizontal: SPACE.s16,
    textAlign: 'center',
  },
  cancel: { minHeight: SIZE.z44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...TYPOGRAPHY.button },
  pressed: { opacity: ALPHA.a70 },
});
