import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { currentBox, sanitiseOtp } from '@/lib/otpCode';
import { TYPOGRAPHY } from '@/constants/typography';
import { COLORS, ALPHA, BORDER_WIDTH, RADIUS, SIZE, SPACE } from '@/constants/tokens';

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
 * The one code field, for sign-up and a password reset: one real field (iOS offers the emailed
 * code above the keyboard); the boxes are drawn from its value and the field lies all but
 * invisibly on top of them, so long-press pastes.
 *
 * A tap anywhere on the boxes selects the field again (owner, 2026-10-12: "if you tap off it
 * just doesn't allow the user to tap back"). The phone passes over a view as faint as the field
 * was, so the boxes take the tap themselves and the field is a little less faint. The selected
 * box has the accent border and, while empty, a text cursor.
 */
const OtpCodeInput = forwardRef<TextInput, Props>(function OtpCodeInput(
  { value, onChange, onComplete, length, textColor, boxColor, autoFocus },
  ref
) {
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput, []);

  const handleChange = (raw: string) => {
    const code = sanitiseOtp(raw, length);
    onChange(code);
    if (code.length === length) onComplete?.(code);
  };

  const current = currentBox({ typed: value.length, length, focused });

  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}>
      <View
        style={styles.row}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length }, (_, i) => {
          const digit = value[i] ?? '';
          const selected = i === current;
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: boxColor,
                  borderColor: selected ? COLORS.accent : digit ? textColor : 'transparent',
                  borderWidth: selected ? BORDER_WIDTH.w2 : BORDER_WIDTH.w1_5,
                },
              ]}
            >
              {selected && !digit ? (
                <View style={[styles.cursor, { backgroundColor: textColor }]} />
              ) : (
                <Text style={[styles.digit, { color: textColor }]}>{digit}</Text>
              )}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
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
    </Pressable>
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
  digit: { ...TYPOGRAPHY.h1 },
  // The selected, empty box's text cursor.
  cursor: { width: BORDER_WIDTH.w2, height: SIZE.z24, borderRadius: RADIUS.pill },
  // Faint, not gone: the phone still offers the emailed code and a long-press still pastes. Its
  // own text is see-through, so only the boxes show the digits.
  input: { ...StyleSheet.absoluteFill, opacity: ALPHA.a04, color: 'transparent' },
});
