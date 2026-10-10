import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TYPOGRAPHY } from '@/constants/typography';
import { BORDER_WIDTH, COLORS, LAYOUT, SEGMENTED, SPACE } from '@/constants/tokens';
import { themeColors } from '@/lib/themeColors';

export type SegmentOption<T> = {
  value: T;
  label: string;
  disabled?: boolean;
  /** What choosing it means, read by VoiceOver after the one-word label. */
  hint?: string;
};

/**
 * A row of two or three one-word choices, one chosen (Settings → Security and privacy → Privacy
 * controls). VoiceOver reads it as a radio group; an option that can't be chosen is dimmed and
 * says so. Each option stays on one line: words too long for their share shrink, then are cut.
 */
export default function SegmentedControl<T extends string | boolean>({
  options,
  value,
  onChange,
  dark,
  label,
  disabled = false,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  dark: boolean;
  /** What the whole control chooses, read by VoiceOver ("Account"). */
  label: string;
  /** The whole control waits (a save is on its way). */
  disabled?: boolean;
}): React.JSX.Element {
  const { text, muted, border } = themeColors(dark);
  const track = dark ? COLORS.surfaceDark2 : COLORS.surfaceLight2;
  const thumb = dark ? COLORS.surfaceDark : COLORS.white;
  return (
    <View
      style={[styles.track, { backgroundColor: track }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((option) => {
        const chosen = option.value === value;
        const off = disabled || option.disabled === true;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => {
              if (!chosen) onChange(option.value);
            }}
            disabled={off}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.hint}
            accessibilityState={{ checked: chosen, disabled: off }}
            style={[
              styles.segment,
              chosen && [styles.chosen, { backgroundColor: thumb, borderColor: border }],
              option.disabled && styles.unavailable,
            ]}
          >
            <Text
              style={[styles.label, { color: chosen ? text : muted }]}
              numberOfLines={SEGMENTED.labelLines}
              adjustsFontSizeToFit
              minimumFontScale={SEGMENTED.labelMinScale}
              maxFontSizeMultiplier={LAYOUT.largeTextScale}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    minHeight: SEGMENTED.minHeight,
    borderRadius: SEGMENTED.radius,
    padding: SEGMENTED.inset,
    gap: SEGMENTED.inset,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SEGMENTED.thumbRadius,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: 'transparent',
    paddingHorizontal: SPACE.s6,
    paddingVertical: SPACE.s6,
  },
  chosen: {
    borderWidth: BORDER_WIDTH.w1,
  },
  unavailable: {
    opacity: SEGMENTED.disabledOpacity,
  },
  // The full width of its share, so shrink-to-fit has a width to fit.
  label: {
    ...TYPOGRAPHY.captionMedium,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
});
