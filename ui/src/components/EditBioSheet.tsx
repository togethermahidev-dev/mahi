import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardInset from '@/components/KeyboardInset';
import { FREE_TEXT_PREDICTION } from '@/lib/emojiKeyboard';
import { bioCounter, canSaveBio, draftBio } from '@/lib/profileAbout';
import { themeColors } from '@/hooks/useAppTheme';
import { GLYPH, TYPOGRAPHY } from '@/constants/typography';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  OFFSET,
  PROFILE_ABOUT,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

interface EditBioSheetProps {
  visible: boolean;
  /** The saved bio the field starts from; null when there is none. */
  bio: string | null;
  dark: boolean;
  onClose: () => void;
  /** Save was tapped with these words. The profile shows them at once and saves; this closes. */
  onSave: (text: string) => void;
}

/**
 * "Edit bio", in the app's usual page sheet (switch `profile-bio-and-counts`): a field that grows
 * with the words, a counter, and Save. A bio is one short paragraph of plain text, 150 characters
 * at most. The keyboard never covers the field or Save: the sheet ends with KeyboardInset.
 */
export default function EditBioSheet({
  visible,
  bio,
  dark,
  onClose,
  onSave,
}: EditBioSheetProps): React.JSX.Element {
  const { bg } = themeColors(dark);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* A Modal is its own native window, with its own insets. The sheet mounts on open, so the
          field starts from the saved bio each time. */}
      <SafeAreaProvider style={{ backgroundColor: bg }}>
        <Sheet bio={bio} dark={dark} onClose={onClose} onSave={onSave} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Sheet({ bio, dark, onClose, onSave }: Omit<EditBioSheetProps, 'visible'>) {
  const { bg, text, muted, border, dangerText } = themeColors(dark);
  const iconSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);
  const top = useSafeAreaInsets().top;
  const [draft, setDraft] = useState(bio ?? '');
  const counter = bioCounter(draft);
  const canSave = canSaveBio(draft, bio);

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { paddingTop: top + SPACE.s16 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: iconSurface, borderColor: border },
            pressed && styles.pressed,
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <Text style={[styles.closeArrow, { color: text }]}>{'‹'}</Text>
        </Pressable>
        <Text style={[styles.title, { color: text }]} numberOfLines={1} accessibilityRole="header">
          Edit bio
        </Text>
      </View>

      {/* The words scroll if they ever outgrow the room above the keyboard; taps on Save land
          with the keyboard up. */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          value={draft}
          onChangeText={(next) => setDraft(draftBio(next))}
          multiline
          scrollEnabled={false}
          autoFocus
          keyboardAppearance={dark ? 'dark' : 'light'}
          placeholder="What are you training for?"
          placeholderTextColor={muted}
          style={[styles.input, { color: text, borderColor: border }]}
          accessibilityLabel="Bio"
          {...FREE_TEXT_PREDICTION}
        />
        <View style={styles.countRow}>
          <Text style={[styles.note, { color: muted }]}>
            Everyone on Mahi can see your bio, even if your account is private.
          </Text>
          <Text
            style={[styles.count, { color: counter.over ? dangerText : muted }]}
            accessibilityLabel={`${counter.text.replace('/', ' of ')} characters`}
          >
            {counter.text}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.save,
            { backgroundColor: text },
            pressed && styles.pressed,
            !canSave && styles.disabled,
          ]}
          onPress={() => onSave(draft)}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel="Save"
          accessibilityHint={counter.over ? 'Your bio is too long to save' : undefined}
          accessibilityState={{ disabled: !canSave }}
        >
          <Text style={[styles.saveText, { color: bg }]}>Save</Text>
        </Pressable>
      </ScrollView>
      <KeyboardInset />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // In a page sheet, which already starts below the status bar (its top inset is 0 there).
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: SPACE.s20,
    paddingHorizontal: SPACE.s20,
    gap: SPACE.s12,
  },
  closeButton: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeArrow: {
    ...GLYPH.icon,
  },
  title: {
    ...TYPOGRAPHY.sheetTitle,
    flex: 1,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: SPACE.s20,
    paddingBottom: SPACE.s20,
    gap: SPACE.s12,
  },
  // Starts a few lines tall and grows with the words (it does not scroll inside itself).
  input: {
    ...TYPOGRAPHY.input,
    minHeight: PROFILE_ABOUT.fieldMinHeight,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r16,
    padding: SPACE.s16,
    textAlignVertical: 'top',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.s12,
  },
  note: {
    ...TYPOGRAPHY.caption,
    flex: 1,
  },
  count: {
    ...TYPOGRAPHY.caption,
    fontVariant: ['tabular-nums'],
  },
  save: {
    minHeight: SIZE.z52,
    borderRadius: RADIUS.r50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    ...TYPOGRAPHY.button,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
  disabled: {
    opacity: ALPHA.a45,
  },
});
