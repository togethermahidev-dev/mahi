import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { usePushStore } from '@/store';
import { PUSH_NUDGE_TEXT, nudgeDismissMark, pushNudge } from '@/lib/pushPrimer';
import { track } from '@/lib/analytics';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BLUR_INTENSITY,
  BORDER_WIDTH,
  FONT_SIZE,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/**
 * The camera's small line under the open-tags pill for someone who is tagged but has
 * notifications off (rules: `pushNudge` in src/lib/pushPrimer.ts; flag `push-core`). A tap
 * opens Mahi in the phone's Settings, or brings up the phone's own question if it has never
 * been asked. The ✕ hides it until the next tag.
 */
export default function PushNudge({
  openTags,
}: {
  openTags: { created_at: string }[];
}): React.JSX.Element | null {
  const { colors } = useAppTheme();
  const flagOn = useFeatureFlag('push-core');
  const permission = usePushStore((s) => s.permission);
  const primerAnswered = usePushStore((s) => s.primerAnswered);
  const dismissedThrough = usePushStore((s) => s.nudgeDismissedThrough);

  const action = pushNudge({ flagOn, permission, primerAnswered, openTags, dismissedThrough });
  if (!action) return null;

  const turnOn = () => {
    track('push_nudge', { action });
    if (action === 'settings') void Linking.openSettings();
    else void usePushStore.getState().requestAndRegister();
  };

  const dismiss = () => {
    track('push_nudge', { action: 'dismiss' });
    const mark = nudgeDismissMark(openTags);
    if (mark) usePushStore.getState().dismissNudge(mark);
  };

  return (
    <BlurView
      intensity={BLUR_INTENSITY.i40}
      tint="dark"
      style={[styles.pill, { borderColor: withAlpha(colors.offWhite, ALPHA.a25) }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PUSH_NUDGE_TEXT}
        accessibilityHint={
          action === 'settings'
            ? "Opens Mahi in your phone's Settings"
            : 'Your phone will ask to allow notifications from Mahi'
        }
        onPress={turnOn}
        style={({ pressed }) => [styles.line, pressed && styles.pressed]}
      >
        <Text style={[styles.text, { color: colors.offWhite }]} numberOfLines={2}>
          {PUSH_NUDGE_TEXT}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        accessibilityHint="Hides this line until you are next tagged"
        onPress={dismiss}
        hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, right: OFFSET.o8 }}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <Text style={[styles.closeText, { color: colors.offWhite }]}>×</Text>
      </Pressable>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    marginTop: SPACE.s8,
    marginHorizontal: SPACE.s16,
    overflow: 'hidden',
  },
  line: {
    flexShrink: 1,
    justifyContent: 'center',
    minHeight: SIZE.z36,
    paddingLeft: SPACE.s16,
    paddingVertical: SPACE.s6,
  },
  text: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f13,
  },
  close: {
    width: SIZE.z36,
    minHeight: SIZE.z36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f13,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
});
