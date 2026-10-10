import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import KeyboardInset from '@/components/KeyboardInset';
import { EmojiKeyboardButton, EmojiPanel, useEmojiKeyboard } from '@/components/EmojiKeyboard';
import { anyEmojiHelp } from '@/lib/emojiKeyboard';
import { themeColors } from '@/hooks/useAppTheme';
import { firstEmoji } from '@/lib/messageReactions';
import { FONTS } from '@/constants/fonts';
import { ALPHA, COLORS, FONT_SIZE, RADIUS, SIZE, SPACE, withAlpha } from '@/constants/tokens';

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
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
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
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text style={[styles.cancelText, { color: text }]}>Cancel</Text>
          </Pressable>
          <EmojiPanel emoji={emoji} />
          <KeyboardInset />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: withAlpha(COLORS.black, ALPHA.a45) },
  sheet: {
    borderTopLeftRadius: RADIUS.r24,
    borderTopRightRadius: RADIUS.r24,
    padding: SPACE.s24,
    gap: SPACE.s12,
  },
  title: { fontFamily: FONTS.bold, fontSize: FONT_SIZE.f22 },
  help: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.f14, lineHeight: SIZE.z20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s8 },
  input: {
    flex: 1,
    minHeight: SIZE.z52,
    borderWidth: SIZE.z1,
    borderRadius: RADIUS.r16,
    paddingHorizontal: SPACE.s16,
    // Inter Tight carries no emoji glyphs: the phone's own emoji font draws what is typed.
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f24,
    textAlign: 'center',
  },
  cancel: { minHeight: SIZE.z44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: FONTS.semiBold, fontSize: FONT_SIZE.f14 },
  pressed: { opacity: ALPHA.a70 },
});
