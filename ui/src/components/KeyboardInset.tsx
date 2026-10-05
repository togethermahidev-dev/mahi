import React, { useEffect, useState } from 'react';
import { Animated, Keyboard, Platform } from 'react-native';

/**
 * Empty space that grows to the keyboard's height and shrinks back when it closes, moving with it.
 *
 * Put it as the LAST child of anything anchored to the bottom of the screen — a bottom sheet, a
 * composer bar — so the fields and buttons above it always sit just above the keyboard.
 * The rule: the keyboard never covers a sheet, a field or a button.
 *
 * Prefer this to KeyboardAvoidingView inside sheets: that one measures its position inside its
 * parent, not on the screen, so inside a sheet it guesses wrong and the field stays covered.
 * For a ScrollView whose fields can sit anywhere, use `automaticallyAdjustKeyboardInsets` instead.
 */
export default function KeyboardInset(): React.JSX.Element {
  const [height] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const move = (toValue: number, duration: number) =>
      Animated.timing(height, {
        toValue,
        duration: ios ? duration : 0,
        useNativeDriver: false,
      }).start();

    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      move(e.endCoordinates.height, e.duration)
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) =>
      move(0, e.duration)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height]);

  return <Animated.View style={{ height }} />;
}
