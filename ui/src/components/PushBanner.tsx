import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { usePushStore } from '@/store';
import { PUSH_BANNER, pushBanner } from '@/lib/pushPrimer';
import { track } from '@/lib/analytics';
import { TYPOGRAPHY } from '@/constants/typography';
import { ALPHA, BORDER_WIDTH, RADIUS, SIZE, SPACE } from '@/constants/tokens';

/**
 * The banner at the top of the feed for someone with notifications off, after Not now on the
 * notifications page or "Don't allow" on the phone's question (rules: `pushBanner` in
 * src/lib/pushPrimer.ts; flag `push-core`; words owner 2026-10-09). Turn on brings up the phone's
 * own question if it has never asked (iOS has no Settings row until it has), else opens Mahi in
 * the phone's Settings. It goes once notifications are on.
 */
export default function PushBanner(): React.JSX.Element | null {
  const { colors } = useAppTheme();
  const flagOn = useFeatureFlag('push-core');
  const permission = usePushStore((s) => s.permission);
  const primerAnswered = usePushStore((s) => s.primerAnswered);

  const action = pushBanner({ flagOn, permission, primerAnswered });
  if (!action) return null;

  const turnOn = () => {
    track('push_nudge', { action });
    if (action === 'settings') void Linking.openSettings();
    else void usePushStore.getState().requestAndRegister();
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.text, { color: colors.text }]}>{PUSH_BANNER.text}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PUSH_BANNER.turnOn}
        accessibilityHint={
          action === 'settings'
            ? "Opens Mahi in your phone's Settings"
            : 'Your phone will ask to allow notifications from Mahi'
        }
        onPress={turnOn}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.text },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.buttonText, { color: colors.bg }]}>{PUSH_BANNER.turnOn}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
    borderRadius: RADIUS.r16,
    borderWidth: BORDER_WIDTH.w1,
    paddingVertical: SPACE.s10,
    paddingLeft: SPACE.s16,
    paddingRight: SPACE.s10,
  },
  text: {
    ...TYPOGRAPHY.small,
    flex: 1,
  },
  button: {
    minHeight: SIZE.z36,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.s16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...TYPOGRAPHY.labelStrong,
  },
  pressed: {
    opacity: ALPHA.a80,
  },
});
