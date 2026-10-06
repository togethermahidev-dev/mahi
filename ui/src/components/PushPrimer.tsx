import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { usePushPrimer } from '@/hooks/usePushPrimer';
import { NotificationsIcon } from '@/components/ScreenIcons';
import { PUSH_PRIMER } from '@/lib/pushPrimer';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  ICON_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/**
 * The full-screen "turn on notifications" page, shown once per device after the welcome cards
 * (flag `push-core`). Its one button, "Continue", always brings up the phone's own question
 * (Apple's guidance: no way to cancel here; the phone's "Don't Allow" is the way out). Someone who
 * says no there gets the camera's line (PushNudge) when a friend next tags them. Android's back
 * button still closes the page without asking.
 */
export default function PushPrimer({
  welcomeSettled,
}: {
  /** The welcome cards are out of the way: seen before, switched off, or just closed. */
  welcomeSettled: boolean;
}): React.JSX.Element | null {
  const { visible, answer } = usePushPrimer(welcomeSettled);
  const { colors, dark } = useAppTheme();
  const insets = useSafeAreaInsets();
  // The phone's question is up, or the answer is being saved: one tap only.
  const [busy, setBusy] = useState(false);

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
          <Text style={[styles.why, { color: withAlpha(colors.text, ALPHA.a70) }]}>
            {PUSH_PRIMER.why}
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: dark ? COLORS.surfaceDark : COLORS.surfaceLight },
          ]}
        >
          <NotificationsIcon size={ICON_SIZE.i32} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>{PUSH_PRIMER.cardTitle}</Text>
          <Text style={[styles.cardBody, { color: withAlpha(colors.text, ALPHA.a70) }]}>
            {PUSH_PRIMER.cardBody}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={PUSH_PRIMER.continue}
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
            <Text style={[styles.buttonText, { color: colors.bg }]}>{PUSH_PRIMER.continue}</Text>
          </Pressable>
        </View>

        {/* Keeps the card in the middle of the space under the headline. */}
        <View />
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
  why: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f17,
    lineHeight: LINE_HEIGHT.l24,
    marginTop: SPACE.s16,
  },
  card: {
    alignItems: 'center',
    borderRadius: RADIUS.r24,
    padding: SPACE.s24,
  },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f20,
    lineHeight: LINE_HEIGHT.l28,
    textAlign: 'center',
    marginTop: SPACE.s12,
  },
  cardBody: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l22,
    textAlign: 'center',
    marginTop: SPACE.s8,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: SPACE.s24,
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
