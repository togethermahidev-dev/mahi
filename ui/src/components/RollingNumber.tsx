/**
 * A number that rolls to its new value, up for a point and down after a miss. On an iPhone build with @expo/ui it is Apple's own
 * rolling digits (SwiftUI's numericText content transition, in Inter); elsewhere, and with Reduce
 * Motion, our count (`useCountRoll`). `null` shows a dash: never a 0 that then changes.
 */
import React, { useEffect, useRef } from 'react';
import { Platform, Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useCountRoll } from '@/components/Motion';
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
  const shown = useCountRoll(value);
  // Apple's digits roll downwards when the number falls (after a miss).
  const last = useRef(value);
  const down = last.current !== null && value !== null && value < last.current;
  useEffect(() => {
    last.current = value;
  }, [value]);
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
            contentTransition('numericText', { countsDown: down }),
            animation(
              Animation.spring({
                duration: (down ? MOTION.countDownMs : MOTION.countUpMs) / 1000,
              }),
              value
            ),
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
