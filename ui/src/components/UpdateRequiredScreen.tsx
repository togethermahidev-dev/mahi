import React from 'react';
import { Linking, Platform, StyleSheet, Text, Pressable, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { VERSION_LINE } from '@/lib/appBuild';
import { TYPOGRAPHY } from '@/constants/typography';
import { ALPHA, RADIUS, SPACE } from '@/constants/tokens';

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
  // Name only this phone's store.
  const store = Platform.OS === 'android' ? 'Google Play' : 'the App Store';
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        Update Mahi
      </Text>
      <Text style={[styles.body, { color: colors.text }]}>
        {message ??
          `This version of Mahi is out of date. Update from ${store} to keep posting with your friends.`}
      </Text>
      {storeUrl ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.text },
            pressed && { opacity: ALPHA.a80 },
          ]}
          onPress={() => Linking.openURL(storeUrl)}
        >
          <Text style={[styles.buttonText, { color: colors.bg }]}>Update now</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.version, { color: colors.muted }]}>
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
    ...TYPOGRAPHY.h1,
    marginBottom: SPACE.s16,
  },
  body: {
    ...TYPOGRAPHY.bodyLarge,
    textAlign: 'center',
  },
  button: {
    marginTop: SPACE.s28,
    paddingVertical: SPACE.s16,
    paddingHorizontal: SPACE.s40,
    borderRadius: RADIUS.r50,
  },
  buttonText: {
    ...TYPOGRAPHY.h3,
  },
  version: {
    ...TYPOGRAPHY.caption,
    marginTop: SPACE.s24,
  },
});
