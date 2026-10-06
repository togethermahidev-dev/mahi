import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  FONT_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SPACE,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';

interface ProfileIdentityCardProps {
  dark: boolean;
  avatar: React.ReactNode;
  displayName: string;
  username?: string | null;
  supportingText: string;
}

/** Shared profile identity treatment for your profile and profiles you visit. */
export default function ProfileIdentityCard({
  dark,
  avatar,
  displayName,
  username,
  supportingText,
}: ProfileIdentityCardProps): React.JSX.Element {
  const { text, muted, border } = themeColors(dark);
  const start = dark ? withAlpha(COLORS.accent, ALPHA.a22) : withAlpha(COLORS.accent, ALPHA.a18);
  const end = dark ? COLORS.surfaceDark2 : COLORS.paper;

  return (
    <LinearGradient colors={[start, end]} style={[styles.card, { borderColor: border }]}>
      <View style={[styles.avatarHalo, { borderColor: withAlpha(COLORS.accent, ALPHA.a35) }]}>
        {avatar}
      </View>
      <Text style={[styles.displayName, { color: text }]}>{displayName}</Text>
      {username ? <Text style={[styles.handle, { color: muted }]}>@{username}</Text> : null}
      <Text style={[styles.supportingText, { color: muted }]}>{supportingText}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    alignItems: 'center',
    borderRadius: RADIUS.r28,
    borderWidth: BORDER_WIDTH.w1,
    paddingTop: SPACE.s24,
    paddingHorizontal: SPACE.s24,
    paddingBottom: SPACE.s24,
  },
  avatarHalo: {
    borderWidth: BORDER_WIDTH.w2,
    borderRadius: RADIUS.r50,
    padding: SPACE.s3,
    marginBottom: SPACE.s16,
  },
  displayName: {
    fontSize: FONT_SIZE.f24,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l28,
    marginBottom: SPACE.s4,
    textAlign: 'center',
  },
  handle: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    marginBottom: SPACE.s12,
  },
  supportingText: {
    fontSize: FONT_SIZE.f13,
    lineHeight: LINE_HEIGHT.l18,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
});
