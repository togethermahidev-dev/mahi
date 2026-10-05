import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { sanitiseOtp } from '@/lib/otpCode';
import { FONTS } from '@/constants/fonts';
import { COLORS, ALPHA, BORDER_WIDTH, FONT_SIZE, RADIUS, SIZE, SPACE } from '@/constants/tokens';

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** Called once all digits are in (typed, pasted or autofilled from the email). */
  onComplete?: (code: string) => void;
  length: number;
  textColor: string;
  boxColor: string;
  autoFocus?: boolean;
}

/**
 * The one-box code field from sign-up: one real field (iOS offers the emailed code above the
 * keyboard); the boxes are drawn from its value and the field lies invisibly on top of them, so
 * tapping any box focuses it and long-press pastes.
 */
const OtpCodeInput = forwardRef<TextInput, Props>(function OtpCodeInput(
  { value, onChange, onComplete, length, textColor, boxColor, autoFocus },
  ref
) {
  const [focused, setFocused] = useState(false);

  const handleChange = (raw: string) => {
    const code = sanitiseOtp(raw, length);
    onChange(code);
    if (code.length === length) onComplete?.(code);
  };

  return (
    <View>
      <View
        style={styles.row}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length }, (_, i) => {
          const digit = value[i] ?? '';
          const current = focused && i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: boxColor,
                  borderColor: current ? COLORS.accent : digit ? textColor : 'transparent',
                  borderWidth: current ? BORDER_WIDTH.w2 : BORDER_WIDTH.w1_5,
                },
              ]}
            >
              <Text style={[styles.digit, { color: textColor }]}>{digit}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        style={styles.input}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        caretHidden
        autoFocus={autoFocus}
        accessibilityLabel="Code from the email"
      />
    </View>
  );
});

export default OtpCodeInput;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACE.s8, justifyContent: 'center' },
  box: {
    width: SIZE.z46,
    height: SIZE.z60,
    borderRadius: RADIUS.r12,
    borderWidth: BORDER_WIDTH.w1_5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: FONT_SIZE.f24, fontFamily: FONTS.bold },
  // Near-zero (not zero) opacity keeps the field tappable and open to autofill.
  input: { ...StyleSheet.absoluteFill, opacity: ALPHA.a01 },
});
