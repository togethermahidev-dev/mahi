/**
 * A number that rolls to its new value, up for a point and down after a miss. On an iPhone build with @expo/ui it is Apple's own
 * rolling digits (SwiftUI's numericText content transition, in Inter); elsewhere, and with Reduce
 * Motion, our count (`useCountRoll`). `null` shows a dash: never a 0 that then changes.
 *
 * The number keeps its own room (owner, 2026-10-10: "the writing overlaps the number"): a box
 * sized from its digit count (`numberBox`), so the words beside or under it are placed clear of
 * it from the first frame. Apple's digits report their size a moment after they are drawn, and
 * they start from the box's top-left corner, so even before that they draw inside the box.
 */
import React, { useEffect, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useCountRoll } from '@/components/Motion';
import { hasNativeExpoUI, loadSwiftUI } from '@/lib/expoUiModule';
import { nativeDigits } from '@/lib/pointMoments';
import { pointsValue } from '@/lib/mahiPoints';
import { numberBox } from '@/lib/pointsNumber';
import { MOTION } from '@/constants/tokens';

export default function RollingNumber({
  value,
  style,
  font,
  maxFontSizeMultiplier,
  appleDigits = true,
  rollDown = true,
}: {
  value: number | null;
  /** Our text's style (also used for the dash). */
  style: StyleProp<TextStyle>;
  /** Apple's digits: the same face, size and colour as `style`. */
  font: { family: string; size: number; color: string };
  /** The most the number grows with the phone's text size; Apple's digits keep to it too. */
  maxFontSizeMultiplier?: number;
  /** Apple's rolling digits where the build has them (a kill switch can say no). */
  appleDigits?: boolean;
  /** Roll down when the number falls; otherwise it just changes. */
  rollDown?: boolean;
}): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const shown = useCountRoll(value, rollDown);
  // Apple's digits roll downwards when the number falls (after a miss).
  const last = useRef(value);
  const down = last.current !== null && value !== null && value < last.current;
  useEffect(() => {
    last.current = value;
  }, [value]);
  const native =
    appleDigits &&
    nativeDigits({ platform: Platform.OS, expoUiPresent: hasNativeExpoUI(), reduceMotion });
  const swift = native ? loadSwiftUI() : null;
  const lineHeight = StyleSheet.flatten(style)?.lineHeight;
  const box = numberBox({
    value,
    shown,
    size: font.size,
    lineHeight: typeof lineHeight === 'number' ? lineHeight : undefined,
    fontScale,
    maxScale: maxFontSizeMultiplier,
    apple: swift !== null,
  });
  const room = [styles.box, { minWidth: box.minWidth, minHeight: box.minHeight }];
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
      <View style={room}>
        <Host matchContents>
          <SText
            modifiers={[
              sFont({ family: font.family, size: box.appleSize }),
              foregroundStyle(font.color),
              contentTransition('numericText', { countsDown: down }),
              ...(down && !rollDown
                ? []
                : [
                    animation(
                      Animation.spring({
                        duration: (down ? MOTION.countDownMs : MOTION.countUpMs) / 1000,
                      }),
                      value
                    ),
                  ]),
            ]}
          >
            {String(value)}
          </SText>
        </Host>
      </View>
    );
  }
  return (
    <View style={room}>
      <Text style={style} maxFontSizeMultiplier={maxFontSizeMultiplier} numberOfLines={1}>
        {pointsValue(shown)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The number's own room. It never gives way in a row (the words beside it wrap or shrink
  // instead), and what is inside starts at its top-left corner.
  box: {
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
});
