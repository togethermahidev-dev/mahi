import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FREE_TEXT_PREDICTION } from '@/lib/emojiKeyboard';
import {
  canContinueDeletion,
  canDeleteAccount,
  DELETE_ACCOUNT_COPY as COPY,
  DELETE_WORD,
  DELETION_CHECKLIST,
  DELETION_REASONS,
  deletionAnswer,
  deletionNoteCounter,
  draftDeletionNote,
  type DeletionAnswer,
  type DeletionReason,
} from '@/lib/accountDeletion';
import { themeColors } from '@/hooks/useAppTheme';
import { FIELD_TEXT, GLYPH, TYPOGRAPHY } from '@/constants/typography';
import {
  ACCOUNT_DELETION,
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

interface DeleteAccountSheetProps {
  visible: boolean;
  dark: boolean;
  /** The deletion is on its way: nothing can be changed or sent twice. */
  busy: boolean;
  onClose: () => void;
  /** Delete account was tapped, with every line ticked and the word typed. */
  onDelete: (answer: DeletionAnswer) => void;
}

/**
 * "Delete account", in the app's usual page sheet (switch `account-delete-reasons`; owner,
 * 2026-10-13: make it harder to do, and ask why). Two steps: why you're leaving (one quick pick;
 * "Something else" takes up to 180 characters of your own words), then tick each thing that is
 * deleted and type the word. Nothing is sent until the last button. The keyboard never covers a
 * field or its button: the page scrolls clear of it.
 */
export default function DeleteAccountSheet({
  visible,
  dark,
  busy,
  onClose,
  onDelete,
}: DeleteAccountSheetProps): React.JSX.Element {
  const { bg } = themeColors(dark);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* A Modal is its own native window, with its own insets. The sheet mounts on open, so a
          half-finished try never carries over to the next one. */}
      <SafeAreaProvider style={{ backgroundColor: bg }}>
        <Sheet dark={dark} busy={busy} onClose={onClose} onDelete={onDelete} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Sheet({ dark, busy, onClose, onDelete }: Omit<DeleteAccountSheetProps, 'visible'>) {
  const { bg, text, muted, border, accent, dangerText } = themeColors(dark);
  const surface = dark ? COLORS.surfaceDark : COLORS.paper;
  const iconSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<'why' | 'confirm'>('why');
  const [reason, setReason] = useState<DeletionReason | null>(null);
  const [note, setNote] = useState('');
  const [ticked, setTicked] = useState<boolean[]>(() => DELETION_CHECKLIST.map(() => false));
  const [typed, setTyped] = useState('');

  const counter = deletionNoteCounter(note);
  const canContinue = canContinueDeletion(reason, note);
  const canDelete = canDeleteAccount(ticked, typed) && !busy;

  // Each step's field sits just above its button, at the end of the page: once the keyboard is
  // up, show the end, so the button is never left under it.
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () =>
      scroll.current?.scrollToEnd({ animated: true })
    );
    return () => shown.remove();
  }, []);

  const back = step === 'confirm';
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACE.s16 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: iconSurface, borderColor: border },
            pressed && styles.pressed,
          ]}
          onPress={back ? () => setStep('why') : onClose}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={back ? 'Back' : 'Close'}
          accessibilityState={{ disabled: busy }}
          hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
        >
          <Text style={[styles.glyph, { color: text }]}>{back ? '‹' : '×'}</Text>
        </Pressable>
        <Text style={[styles.title, { color: text }]} numberOfLines={1} accessibilityRole="header">
          {COPY.title}
        </Text>
      </View>

      {/* Keyed by step, so each opens at its top. */}
      <ScrollView
        key={step}
        ref={scroll}
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.s24 }]}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {step === 'why' ? (
          <>
            <View style={styles.intro}>
              <Text style={[styles.heading, { color: text }]} accessibilityRole="header">
                {COPY.whyTitle}
              </Text>
              <Text style={[styles.help, { color: muted }]}>{COPY.whyHelp}</Text>
            </View>

            <View
              style={[styles.group, { backgroundColor: surface, borderColor: border }]}
              accessibilityRole="radiogroup"
              accessibilityLabel={COPY.whyTitle}
            >
              {DELETION_REASONS.map((option, i) => {
                const chosen = reason === option.code;
                return (
                  <Pressable
                    key={option.code}
                    onPress={() => setReason(option.code)}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: chosen }}
                    style={({ pressed }) => [
                      styles.row,
                      i > 0 && [styles.divided, { borderTopColor: border }],
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.rowText, { color: text }]}>{option.label}</Text>
                    <View style={[styles.radio, { borderColor: chosen ? accent : muted }]}>
                      {chosen ? (
                        <View style={[styles.radioDot, { backgroundColor: accent }]} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {reason === 'other' ? (
              <View style={styles.field}>
                <TextInput
                  value={note}
                  onChangeText={(next) => setNote(draftDeletionNote(next))}
                  multiline
                  scrollEnabled={false}
                  keyboardAppearance={dark ? 'dark' : 'light'}
                  placeholder={COPY.notePlaceholder}
                  placeholderTextColor={muted}
                  style={[styles.note, { color: text, borderColor: border }]}
                  accessibilityLabel={COPY.notePlaceholder}
                  {...FREE_TEXT_PREDICTION}
                />
                <View style={styles.countRow}>
                  <Text style={[styles.help, styles.grow, { color: muted }]}>{COPY.noteHelp}</Text>
                  <Text
                    style={[styles.count, { color: counter.over ? dangerText : muted }]}
                    accessibilityLabel={`${counter.text.replace('/', ' of ')} characters`}
                  >
                    {counter.text}
                  </Text>
                </View>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: text },
                pressed && styles.pressed,
                !canContinue && styles.disabled,
              ]}
              onPress={() => {
                Keyboard.dismiss();
                setStep('confirm');
              }}
              disabled={!canContinue}
              accessibilityRole="button"
              accessibilityLabel={COPY.next}
              accessibilityHint={
                reason === null
                  ? 'Pick a reason first'
                  : counter.over && reason === 'other'
                    ? 'Your words are too long'
                    : undefined
              }
              accessibilityState={{ disabled: !canContinue }}
            >
              <Text style={[styles.buttonText, { color: bg }]}>{COPY.next}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.heading, { color: text }]} accessibilityRole="header">
              {COPY.confirmTitle}
            </Text>

            <View style={[styles.group, { backgroundColor: surface, borderColor: border }]}>
              {DELETION_CHECKLIST.map((line, i) => {
                const on = ticked[i];
                return (
                  <Pressable
                    key={line}
                    onPress={() => setTicked((was) => was.map((t, j) => (j === i ? !t : t)))}
                    disabled={busy}
                    accessibilityRole="checkbox"
                    accessibilityLabel={line}
                    accessibilityState={{ checked: on, disabled: busy }}
                    style={({ pressed }) => [
                      styles.row,
                      i > 0 && [styles.divided, { borderTopColor: border }],
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.box,
                        { borderColor: on ? accent : muted },
                        on && { backgroundColor: accent },
                      ]}
                    >
                      {on ? <Text style={styles.boxTick}>✓</Text> : null}
                    </View>
                    <Text style={[styles.rowText, { color: text }]}>{line}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.intro}>
              <Text style={[styles.help, { color: muted }]}>{COPY.alsoGoes}</Text>
              <Text style={[styles.help, { color: muted }]}>{COPY.kept}</Text>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: text }]}>{COPY.typeLabel}</Text>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="done"
                keyboardAppearance={dark ? 'dark' : 'light'}
                placeholder={DELETE_WORD}
                placeholderTextColor={muted}
                style={[styles.word, { color: text, borderColor: border }]}
                accessibilityLabel={COPY.typeLabel}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: dangerText },
                pressed && styles.pressed,
                !canDelete && styles.disabled,
              ]}
              onPress={() => {
                if (reason) onDelete(deletionAnswer(reason, note));
              }}
              disabled={!canDelete}
              accessibilityRole="button"
              accessibilityLabel={busy ? COPY.busy : COPY.confirm}
              accessibilityHint={
                canDelete || busy ? undefined : 'Tick every line and type delete first'
              }
              accessibilityState={{ disabled: !canDelete, busy }}
            >
              <Text style={[styles.buttonText, { color: bg }]}>
                {busy ? COPY.busy : COPY.confirm}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
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
  headerButton: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    ...GLYPH.icon,
  },
  title: {
    ...TYPOGRAPHY.sheetTitle,
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACE.s20,
    gap: SPACE.s16,
  },
  intro: {
    gap: SPACE.s4,
  },
  heading: {
    ...TYPOGRAPHY.h3,
  },
  // The line under a heading, under the note field and under the list.
  help: {
    ...TYPOGRAPHY.caption,
  },
  grow: {
    flex: 1,
  },
  // A card of rows with a hairline between one and the next, like Settings.
  group: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r20,
    overflow: 'hidden',
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    minHeight: SIZE.z52,
    paddingVertical: SPACE.s14,
    paddingHorizontal: SPACE.s16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
  },
  rowText: {
    ...TYPOGRAPHY.body,
    flex: 1,
  },
  radio: {
    width: SIZE.z24,
    height: SIZE.z24,
    borderRadius: RADIUS.r12,
    borderWidth: BORDER_WIDTH.w2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: SIZE.z10,
    height: SIZE.z10,
    borderRadius: RADIUS.pill,
  },
  box: {
    width: SIZE.z24,
    height: SIZE.z24,
    borderRadius: RADIUS.r8,
    borderWidth: BORDER_WIDTH.w2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxTick: {
    ...TYPOGRAPHY.captionStrong,
    color: COLORS.offBlack,
  },
  field: {
    gap: SPACE.s8,
  },
  // Starts a few lines tall and grows with the words (it does not scroll inside itself).
  note: {
    ...TYPOGRAPHY.input,
    minHeight: ACCOUNT_DELETION.fieldMinHeight,
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
  count: {
    ...TYPOGRAPHY.caption,
    fontVariant: ['tabular-nums'],
  },
  label: {
    ...TYPOGRAPHY.bodyStrong,
  },
  word: {
    ...FIELD_TEXT,
    minHeight: SIZE.z52,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r16,
    paddingHorizontal: SPACE.s16,
  },
  button: {
    minHeight: SIZE.z52,
    borderRadius: RADIUS.r50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...TYPOGRAPHY.button,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
  disabled: {
    opacity: ALPHA.a45,
  },
});
