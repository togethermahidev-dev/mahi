import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { getMyStanding, markWarningsSeen, signOut } from '@/api';
import { standingNotice, type StandingNotice } from '@/lib/reports';
import { reportError } from '@/lib/sentry';
import { FONTS } from '@/constants/fonts';
import { ALPHA, FONT_SIZE, LINE_HEIGHT, RADIUS, SPACE } from '@/constants/tokens';

/** Users already told about a suspension this time the app is open (it's told once per launch;
 * nothing is kept on the phone, as a suspension can be lifted). */
const toldThisLaunch = new Set<string>();

/**
 * Your standing with Mahi (docs/moderation.md, get_my_standing), read once when the app opens
 * signed in. A new warning or a suspension: a plain notice, then the warnings are marked seen.
 * Banned: a full screen saying so, over the app, with Sign out.
 */
export default function AccountStanding({ userId }: { userId: string }): React.JSX.Element | null {
  const [banned, setBanned] = useState<StandingNotice | null>(null);

  useEffect(() => {
    let live = true;
    getMyStanding().then(({ data, error }) => {
      if (error) {
        reportError(error, { flow: 'moderation', action: 'loadStanding', extra: { userId } });
      }
      if (!live || !data) return;
      const notice = standingNotice(data);
      if (!notice) return;
      if (notice.kind === 'banned') {
        setBanned(notice);
        return;
      }
      if (notice.kind === 'suspended' && data.warnings.length === 0) {
        if (toldThisLaunch.has(userId)) return;
        toldThisLaunch.add(userId);
      }
      Alert.alert(notice.title, notice.body, [
        {
          text: 'OK',
          onPress: () =>
            void markWarningsSeen().then(({ error }) => {
              if (error) {
                reportError(error, {
                  flow: 'moderation',
                  action: 'markWarningsSeen',
                  level: 'warning',
                });
              }
            }),
        },
      ]);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const { colors } = useAppTheme();
  if (!banned) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {banned.title}
      </Text>
      <Text style={[styles.body, { color: colors.text }]}>{banned.body}</Text>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.text },
          pressed && { opacity: ALPHA.a80 },
        ]}
        onPress={() =>
          void signOut().then(({ error }) => {
            if (error) reportError(error, { flow: 'moderation', action: 'signOut' });
          })
        }
      >
        <Text style={[styles.buttonText, { color: colors.bg }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s32,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f28,
    marginBottom: SPACE.s16,
    textAlign: 'center',
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
});
