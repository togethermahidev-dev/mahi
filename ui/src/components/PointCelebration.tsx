import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  FadeIn,
  ReduceMotion,
  useReducedMotion,
  ZoomIn,
} from 'react-native-reanimated';
import { useAppTheme } from '@/hooks/useAppTheme';
import { PressScale } from '@/components/Motion';
import { useCoachBlock } from '@/hooks/useCoachMarks';
import { FONTS } from '@/constants/fonts';
import { TYPOGRAPHY } from '@/constants/typography';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  DURATION,
  FONT_SIZE,
  LAYOUT,
  MOTION,
  POINTS_NUMBER,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

export interface PointCelebrationContent {
  title: string;
  total: string;
  lines: string[];
  /** "Cheer @sam on": a way to the mate whose tag was answered. */
  cheer?: { label: string; onPress: () => void };
  /** What the round badge says (default "+1"; the miss moment shows "0"), and VoiceOver's words. */
  badge?: string;
  badgeLabel?: string;
}

/**
 * The moment a post earns a Mahi point: a big "+1" that lands, the new total, and what it means
 * (reactive posting). Words come from `pointCelebration` in `@/lib/mahiPoints`. With Reduce Motion
 * the "+1" fades in instead of springing. The same moment, with a "0", says a miss
 * (`missMoment`, shown by MissMoment.tsx).
 */
export default function PointCelebration({
  content,
  onClose,
}: {
  content: PointCelebrationContent | null;
  onClose: () => void;
}): React.JSX.Element {
  const { colors, dark } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const card = dark ? COLORS.surfaceDark : COLORS.white;
  // No one-time tip while the point is celebrated.
  useCoachBlock(content !== null);

  return (
    <Modal visible={content !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: withAlpha(COLORS.black, ALPHA.a70) }]}>
        {content ? (
          <View
            style={[styles.card, { backgroundColor: card, borderColor: colors.accent }]}
            accessibilityViewIsModal
          >
            <Reanimated.View
              entering={
                reduceMotion
                  ? FadeIn.duration(DURATION.d200).reduceMotion(ReduceMotion.Never)
                  : ZoomIn.springify()
                      .damping(MOTION.morph.damping)
                      .stiffness(MOTION.morph.stiffness)
              }
              style={[styles.badge, { backgroundColor: colors.accent }]}
              accessible
              accessibilityLabel={content.badgeLabel ?? 'Plus 1 Mahi point'}
            >
              {/* The circle is a fixed size: its number grows only up to large text and shrinks
                  to fit, so it never spills over the words under it. */}
              <Text
                style={[styles.plusOne, { color: COLORS.offBlack }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={POINTS_NUMBER.badgeMinScale}
                maxFontSizeMultiplier={LAYOUT.largeTextScale}
              >
                {content.badge ?? '+1'}
              </Text>
            </Reanimated.View>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {content.title}
            </Text>
            <Text style={[styles.total, { color: colors.accentText }]}>{content.total}</Text>
            {content.lines.map((line) => (
              <Text key={line} style={[styles.line, { color: colors.muted }]}>
                {line}
              </Text>
            ))}
            <PressScale
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, { color: COLORS.offBlack }]}>Got it</Text>
            </PressScale>
            {content.cheer ? (
              <PressScale
                style={styles.secondary}
                onPress={() => {
                  onClose();
                  content.cheer?.onPress();
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: colors.accentText }]}>
                  {content.cheer.label}
                </Text>
              </PressScale>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s24,
  },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderRadius: RADIUS.r28,
    borderWidth: BORDER_WIDTH.w1,
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s32,
    paddingBottom: SPACE.s20,
  },
  badge: {
    width: SIZE.z96,
    height: SIZE.z96,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s8,
    marginBottom: SPACE.s20,
  },
  plusOne: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f38,
  },
  title: {
    ...TYPOGRAPHY.h2,
    textAlign: 'center',
  },
  total: {
    ...TYPOGRAPHY.bodyStrong,
    marginTop: SPACE.s8,
    marginBottom: SPACE.s12,
    textAlign: 'center',
  },
  line: {
    ...TYPOGRAPHY.small,
    textAlign: 'center',
    marginTop: SPACE.s6,
  },
  button: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: SIZE.z52,
    borderRadius: RADIUS.pill,
    marginTop: SPACE.s24,
  },
  buttonText: {
    ...TYPOGRAPHY.button,
  },
  secondary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: SIZE.z44,
    marginTop: SPACE.s8,
  },
  secondaryText: {
    ...TYPOGRAPHY.button,
  },
});
