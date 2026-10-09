import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { usePushPrimer } from '@/hooks/usePushPrimer';
import { PUSH_PRIMER } from '@/lib/pushPrimer';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/**
 * The full-screen "turn on notifications" page, the last onboarding page, after the welcome cards
 * and the privacy choice (flag `push-core`; words owner 2026-10-09). Turn on brings up the phone's
 * own question; Not now closes the page, and the banner at the top of the feed (PushBanner) offers
 * it again. Android's back button counts as Not now. `onSettled(true)` once it has nothing left to
 * show, so onboarding can finish.
 */
export default function PushPrimer({
  after,
  onSettled,
}: {
  /** The onboarding pages before this one are out of the way. */
  after: boolean;
  onSettled: (settled: boolean) => void;
}): React.JSX.Element | null {
  const { visible, pending, answer } = usePushPrimer(after);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  // The phone's question is up, or the answer is being saved: one tap only.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onSettled(!pending);
  }, [pending, onSettled]);

  if (!visible) return null;

  const choose = (allow: boolean) => {
    if (busy) return;
    setBusy(true);
    answer(allow).finally(() => setBusy(false));
  };

  return (
    <Modal visible animationType="fade" onRequestClose={() => choose(false)} statusBarTranslucent>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + SPACE.s48, paddingBottom: insets.bottom + SPACE.s24 },
        ]}
        bounces={false}
      >
        <View>
          <Text accessibilityRole="header" style={[styles.headline, { color: colors.text }]}>
            {PUSH_PRIMER.headline}
          </Text>
          <Text style={[styles.line, { color: withAlpha(colors.text, ALPHA.a70) }]}>
            {PUSH_PRIMER.line}
          </Text>
        </View>

        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={PUSH_PRIMER.turnOn}
            accessibilityHint="Your phone will ask whether to allow notifications from Mahi"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => choose(true)}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.text, borderColor: colors.text },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.bg }]}>{PUSH_PRIMER.turnOn}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={PUSH_PRIMER.notNow}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => choose(false)}
            style={({ pressed }) => [
              styles.button,
              { borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>{PUSH_PRIMER.notNow}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s24,
    gap: SPACE.s32,
  },
  headline: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f32,
    lineHeight: LINE_HEIGHT.l38,
  },
  line: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f17,
    lineHeight: LINE_HEIGHT.l24,
    marginTop: SPACE.s16,
  },
  buttons: {
    gap: SPACE.s12,
  },
  button: {
    alignSelf: 'stretch',
    minHeight: SIZE.z52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.r50,
    borderWidth: BORDER_WIDTH.w1,
    paddingHorizontal: SPACE.s16,
  },
  buttonText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f16,
  },
  pressed: {
    opacity: ALPHA.a80,
  },
});
