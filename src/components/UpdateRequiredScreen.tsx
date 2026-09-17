import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

/** Shown instead of the app when this build is older than the server's minimum version. */
export default function UpdateRequiredScreen({
  current,
  minimum,
}: {
  current: string;
  minimum: string;
}): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]}>Update Mahi</Text>
      <Text style={[styles.body, { color: colors.text }]}>
        This version of Mahi is out of date. Update it from the App Store or Google Play to keep
        posting with your friends.
      </Text>
      <Text style={[styles.version, { color: colors.accent }]}>
        You have {current} · needed {minimum}
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
  version: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 13,
    marginTop: 24,
  },
});
