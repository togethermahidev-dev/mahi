/**
 * A number that rolls to its new value. On an iPhone build with @expo/ui it is Apple's own
 * rolling digits (SwiftUI's numericText content transition, in Inter); elsewhere, and with Reduce
 * Motion, our count (`useCountUp`). `null` shows a dash: never a 0 that then changes.
 */
import React from 'react';
import { Platform, Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useCountUp } from '@/components/Motion';
import { hasNativeExpoUI, loadSwiftUI } from '@/lib/expoUiModule';
import { nativeDigits } from '@/lib/pointMoments';
import { pointsValue } from '@/lib/mahiPoints';
import { MOTION } from '@/constants/tokens';

export default function RollingNumber({
  value,
  style,
  font,
  maxFontSizeMultiplier,
}: {
  value: number | null;
  /** Our text's style (also used for the dash). */
  style: StyleProp<TextStyle>;
  /** Apple's digits: the same face, size and colour as `style`. */
  font: { family: string; size: number; color: string };
  maxFontSizeMultiplier?: number;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const shown = useCountUp(value);
  const native =
    value !== null &&
    nativeDigits({ platform: Platform.OS, expoUiPresent: hasNativeExpoUI(), reduceMotion });
  const swift = native ? loadSwiftUI() : null;
  if (swift && value !== null) {
    const { Host, Text: SText } = swift.ui;
    const {
      animation,
      Animation,
      contentTransition,
      font: sFont,
      foregroundStyle,
    } = swift.modifiers;
    return (
      <Host matchContents>
        <SText
          modifiers={[
            sFont({ family: font.family, size: font.size }),
            foregroundStyle(font.color),
            contentTransition('numericText', { countsDown: false }),
            animation(Animation.spring({ duration: MOTION.countUpMs / 1000 }), value),
          ]}
        >
          {String(value)}
        </SText>
      </Host>
    );
  }
  return (
    <Text style={style} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {pointsValue(shown)}
    </Text>
  );
}
