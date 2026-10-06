import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import KeyboardInset from '@/components/KeyboardInset';
import { updatePostCaption } from '@/api';
import { useFeedStore, useProfilePostsStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FONTS } from '@/constants/fonts';
import { ALPHA, COLORS, FONT_SIZE, RADIUS, SIZE, SPACE, withAlpha } from '@/constants/tokens';

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

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const result = await updatePostCaption(postId, draft.trim());
    setSaving(false);
    if (result.error) {
      const ended = result.error.message.includes('editing has ended');
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
            value={draft}
            onChangeText={setDraft}
            maxLength={200}
            multiline
            autoFocus
            keyboardAppearance={dark ? 'dark' : 'light'}
            placeholder="What did you do?"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          <Text style={[styles.count, { color: colors.muted }]}>{draft.length}/200</Text>
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
  input: {
    minHeight: SIZE.z120,
    borderWidth: SIZE.z1,
    borderRadius: RADIUS.r16,
    padding: SPACE.s16,
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f16,
    textAlignVertical: 'top',
  },
  count: { alignSelf: 'flex-end', fontFamily: FONTS.regular, fontSize: FONT_SIZE.f12 },
  save: {
    minHeight: SIZE.z52,
    borderRadius: RADIUS.r50,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: COLORS.offBlack, fontFamily: FONTS.bold, fontSize: FONT_SIZE.f16 },
  pressed: { opacity: ALPHA.a80 },
  disabled: { opacity: ALPHA.a45 },
});
