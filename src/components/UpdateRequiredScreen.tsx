import React from 'react';
import { Linking, StyleSheet, Text, Pressable, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { VERSION_LINE } from '@/lib/appBuild';
import { FONTS } from '@/constants/fonts';
import { FONT_SIZE, SPACE, RADIUS, LINE_HEIGHT } from '@/constants/tokens';

/** Shown instead of the app when this build is older than the server's minimum version. */
export default function UpdateRequiredScreen({
  minimum,
  storeUrl,
  message,
}: {
  minimum: string;
  storeUrl: string | null;
  message: string | null;
}): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]}>Update Mahi</Text>
      <Text style={[styles.body, { color: colors.text }]}>
        {message ??
          'This version of Mahi is out of date. Update it from the App Store or Google Play to keep posting with your friends.'}
      </Text>
      {storeUrl ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.text },
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => Linking.openURL(storeUrl)}
        >
          <Text style={[styles.buttonText, { color: colors.bg }]}>Update now</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.version, { color: colors.accent }]}>
        {VERSION_LINE} · needs {minimum}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s32,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f28,
    marginBottom: SPACE.s16,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f16,
    textAlign: 'center',
    lineHeight: LINE_HEIGHT.l24,
  },
  button: {
    marginTop: SPACE.s28,
    paddingVertical: SPACE.s16,
    paddingHorizontal: SPACE.s40,
    borderRadius: RADIUS.r50,
  },
  buttonText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f16,
  },
  version: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f13,
    marginTop: SPACE.s24,
  },
});
