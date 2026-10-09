import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useUserStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { reportError } from '@/lib/sentry';
import {
  ACCOUNT_OPTIONS,
  PRIVACY_CHOICE_LEDE,
  privacyChoicePatch,
  showPrivacyChoice,
} from '@/lib/accountControls';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  FONT_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SIZE,
  SPACE,
} from '@/constants/tokens';

/**
 * The public / private choice after sign-up (switch `private-accounts`, owner 2026-10-08): one
 * screen, two cards saying what each means. It opens once the welcome cards close (`after`;
 * order owner 2026-10-09). Nothing is picked for the account: the person chooses. Who can tag
 * you isn't asked here (owner, 2026-10-09): the server's default stays, and Settings changes it.
 * Continue saves through `set_account_controls`, which also marks the choice made, so it shows
 * once. Shown only while the server says nothing was chosen (existing accounts were marked
 * chosen, and stay public). `onSettled(true)` once it is out of the way (or never needed), so the
 * notifications page can follow.
 */
export default function PrivacyChoiceStep({
  after,
  onSettled,
}: {
  /** The page before this one (the welcome cards) is out of the way. */
  after: boolean;
  onSettled: (settled: boolean) => void;
}): React.JSX.Element | null {
  const flagOn = useFeatureFlag('private-accounts');
  const chosenAt = useUserStore((s) => s.profile?.privacy_chosen_at);
  // Still to choose; settled is told from this alone, so it never reads as done while waiting.
  const needed = showPrivacyChoice({ flagOn, chosenAt });
  const { colors, dark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    onSettled(!needed);
  }, [needed, onSettled]);

  if (!needed || !after) return null;

  const surface = dark ? COLORS.surfaceDark : COLORS.paper;

  const save = async () => {
    if (isPrivate === null || saving) return;
    setSaving(true);
    const { error } = await useUserStore.getState().saveControls(privacyChoicePatch(isPrivate));
    setSaving(false);
    if (error) {
      reportError(error, {
        flow: 'signup',
        action: 'privacyChoice',
        extra: { rpc: 'set_account_controls' },
      });
      useToastStore.getState().show('Couldn’t save your choice. Try again.');
    }
    // Saved: the profile now has privacy_chosen_at, so this step closes itself.
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + SPACE.s48, paddingBottom: insets.bottom + SPACE.s24 },
        ]}
        bounces={false}
      >
        <View style={styles.body}>
          <Text accessibilityRole="header" style={[styles.headline, { color: colors.text }]}>
            Who sees your workouts?
          </Text>
          <Text style={[styles.lede, { color: colors.muted }]}>{PRIVACY_CHOICE_LEDE}</Text>

          <View style={styles.cards} accessibilityRole="radiogroup" accessibilityLabel="Account">
            {ACCOUNT_OPTIONS.map((option) => {
              const chosen = isPrivate === option.value;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => setIsPrivate(option.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label}. ${option.description}`}
                  accessibilityState={{ checked: chosen }}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      backgroundColor: surface,
                      borderColor: chosen ? colors.accent : colors.border,
                    },
                    chosen && styles.cardChosen,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{option.label}</Text>
                    <View
                      style={[
                        styles.radio,
                        { borderColor: chosen ? colors.accent : colors.border },
                      ]}
                    >
                      {chosen ? (
                        <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />
                      ) : null}
                    </View>
                  </View>
                  <Text style={[styles.cardLine, { color: colors.muted }]}>
                    {option.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => void save()}
          disabled={isPrivate === null || saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: isPrivate === null || saving, busy: saving }}
          accessibilityHint={isPrivate === null ? 'Choose public or private first' : undefined}
          style={({ pressed }) => [
            styles.continue,
            isPrivate === null && styles.continueOff,
            pressed && styles.pressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.offBlack} />
          ) : (
            <Text style={styles.continueText}>Continue</Text>
          )}
        </Pressable>
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
  body: {
    gap: SPACE.s12,
  },
  headline: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f32,
    lineHeight: LINE_HEIGHT.l38,
  },
  lede: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l22,
    marginBottom: SPACE.s8,
  },
  cards: {
    gap: SPACE.s12,
  },
  card: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r20,
    padding: SPACE.s16,
    gap: SPACE.s6,
  },
  cardChosen: {
    borderWidth: BORDER_WIDTH.w2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f18,
  },
  cardLine: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f14,
    lineHeight: LINE_HEIGHT.l20,
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
  continue: {
    minHeight: SIZE.z52,
    borderRadius: RADIUS.r50,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueOff: {
    opacity: ALPHA.a40,
  },
  continueText: {
    color: COLORS.offBlack,
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f16,
  },
  pressed: {
    opacity: ALPHA.a80,
  },
});
