import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeColors, useAppTheme } from '@/hooks/useAppTheme';
import { WORKOUT_SAFETY_LINE, workoutIdeas } from '@/lib/workoutIdeas';
import { TYPOGRAPHY } from '@/constants/typography';
import { ALPHA, COLORS, RADIUS, SIZE, SPACE } from '@/constants/tokens';

/**
 * "Need an idea?" from the caption sheet: what counts as a workout, in a native page sheet. The
 * first idea changes with the weekday; the sheet ends with a safety line. Words only: nothing is
 * picked, saved or tracked.
 */
export default function WorkoutIdeasSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own native window, with its own insets. */}
      <SafeAreaProvider>{visible ? <Ideas onClose={onClose} /> : null}</SafeAreaProvider>
    </Modal>
  );
}

function Ideas({ onClose }: { onClose: () => void }) {
  const { dark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted, border } = themeColors(dark);
  const ideas = workoutIdeas();

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.s24 }]}
      >
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Any of these counts
        </Text>
        <View style={styles.list}>
          {ideas.map((idea) => (
            <Text
              key={idea}
              style={[styles.idea, { color: text, borderBottomColor: border }]}
              accessibilityRole="text"
            >
              {idea}
            </Text>
          ))}
        </View>
        <Text style={[styles.safety, { color: muted }]}>{WORKOUT_SAFETY_LINE}</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: ALPHA.a70 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Got it"
        >
          <Text style={styles.buttonText}>Got it</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s32,
    gap: SPACE.s16,
  },
  title: {
    ...TYPOGRAPHY.sheetTitle,
  },
  list: {
    gap: SPACE.s4,
  },
  idea: {
    ...TYPOGRAPHY.body,
    paddingVertical: SPACE.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  safety: {
    ...TYPOGRAPHY.small,
  },
  // The app's one main-button style: accent pill, dark words.
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.pill,
    minHeight: SIZE.z44,
    paddingVertical: SPACE.s12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.s8,
  },
  buttonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.offBlack,
  },
});
