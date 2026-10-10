import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import KeyboardInset from '@/components/KeyboardInset';
import { EmojiKeyboardButton, EmojiPanel, useEmojiKeyboard } from '@/components/EmojiKeyboard';
import { FREE_TEXT_PREDICTION } from '@/lib/emojiKeyboard';
import { updatePostCaption } from '@/api';
import { useFeedStore, useProfilePostsStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { reportError } from '@/lib/sentry';
import { TYPOGRAPHY } from '@/constants/typography';
import { ALPHA, COLORS, RADIUS, SIZE, SPACE, withAlpha } from '@/constants/tokens';

export default function EditPostCaptionSheet({
  postId,
  caption,
  onClose,
}: {
  postId: string;
  caption: string | null;
  onClose: () => void;
}) {
  const { colors, dark } = useAppTheme();
  const [draft, setDraft] = useState(caption ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const emoji = useEmojiKeyboard(inputRef);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const result = await updatePostCaption(postId, draft.trim());
    setSaving(false);
    if (result.error) {
      const ended = result.error.message.includes('editing has ended');
      if (!ended)
        reportError(result.error, { flow: 'posts', action: 'saveCaption', extra: { postId } });
      useToastStore
        .getState()
        .show(ended ? 'The one-hour editing window has ended.' : 'Couldn’t save your caption.');
      return;
    }
    useFeedStore.getState().patchPost(postId, { caption: result.data?.caption ?? null });
    useProfilePostsStore.getState().patchPost(postId, { caption: result.data?.caption ?? null });
    useToastStore.getState().show('Caption updated.');
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityLabel="Close caption editor"
        />
        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <Text style={[styles.title, { color: colors.text }]}>Edit caption</Text>
          <Text style={[styles.help, { color: colors.muted }]}>
            You can edit for one hour after posting.
          </Text>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            maxLength={200}
            multiline
            autoFocus
            keyboardAppearance={dark ? 'dark' : 'light'}
            placeholder="What did you do?"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            onBlur={emoji.onBlur}
            {...FREE_TEXT_PREDICTION}
          />
          <View style={styles.countRow}>
            <EmojiKeyboardButton emoji={emoji} color={colors.muted} />
            <Text style={[styles.count, { color: colors.muted }]}>{draft.length}/200</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            style={({ pressed }) => [
              styles.save,
              pressed && styles.pressed,
              saving && styles.disabled,
            ]}
            onPress={() => void save()}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save caption'}</Text>
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
  title: { ...TYPOGRAPHY.sheetTitle },
  help: { ...TYPOGRAPHY.small },
  input: {
    ...TYPOGRAPHY.input,
    minHeight: SIZE.z120,
    borderWidth: SIZE.z1,
    borderRadius: RADIUS.r16,
    padding: SPACE.s16,
    textAlignVertical: 'top',
  },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...TYPOGRAPHY.caption, marginLeft: 'auto' },
  save: {
    minHeight: SIZE.z52,
    borderRadius: RADIUS.r50,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { ...TYPOGRAPHY.button, color: COLORS.offBlack },
  pressed: { opacity: ALPHA.a80 },
  disabled: { opacity: ALPHA.a45 },
});
