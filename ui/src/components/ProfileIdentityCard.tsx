import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TYPOGRAPHY } from '@/constants/typography';
import { PROFILE, SPACE } from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';

interface ProfileIdentityCardProps {
  dark: boolean;
  avatar: React.ReactNode;
  displayName: string;
  username?: string | null;
  /** A line under the handle (someone else's profile). */
  supportingText?: string;
  /** Under the handle on your own profile: the short links to Friends and Your invites. */
  children?: React.ReactNode;
}

/**
 * Who a profile belongs to, kept short so the grid of posts shows without scrolling (owner,
 * 2026-10-10): the name and @username on the left, the profile picture on the right. Shared by
 * your profile and profiles you visit. Plain black and white on the page, no card around it.
 */
export default function ProfileIdentityCard({
  dark,
  avatar,
  displayName,
  username,
  supportingText,
  children,
}: ProfileIdentityCardProps): React.JSX.Element {
  const { text, muted } = themeColors(dark);

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        {/* A long name shrinks a little to stay on one line, so the header keeps its height. */}
        <Text
          style={[styles.displayName, { color: text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={PROFILE.nameMinScale}
          accessibilityRole="header"
        >
          {displayName}
        </Text>
        {username ? (
          <Text style={[styles.handle, { color: muted }]} numberOfLines={1}>
            @{username}
          </Text>
        ) : null}
        {supportingText ? (
          <Text style={[styles.supportingText, { color: muted }]}>{supportingText}</Text>
        ) : null}
        {children}
      </View>
      {avatar}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.s16,
  },
  // The words take what the picture leaves, and wrap inside it.
  copy: {
    flex: 1,
  },
  displayName: {
    ...TYPOGRAPHY.h2,
  },
  handle: {
    ...TYPOGRAPHY.body,
    marginTop: SPACE.s2,
  },
  supportingText: {
    ...TYPOGRAPHY.small,
    marginTop: SPACE.s8,
  },
});
