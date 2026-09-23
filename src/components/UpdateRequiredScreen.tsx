import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { VERSION_LINE } from '@/lib/appBuild';

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
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.text }]}
          activeOpacity={0.8}
          onPress={() => Linking.openURL(storeUrl)}
        >
          <Text style={[styles.buttonText, { color: colors.bg }]}>Update now</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 32,
  },
  title: {
    fontFamily: 'JosefinSans_700Bold',
    fontSize: 28,
    marginBottom: 16,
  },
  body: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    marginTop: 28,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 50,
  },
  buttonText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 16,
  },
  version: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 13,
    marginTop: 24,
  },
});
