import React, { useEffect } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import KeyboardInset from '@/components/KeyboardInset';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCoachBlock } from '@/hooks/useCoachMarks';
import { claimFailText, inviteAcceptLine, inviteAsk } from '@/lib/inviteLink';
import { useInviteStore, useUserStore } from '@/store';
import { useToastStore } from '@/store/toastStore';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/**
 * An invite link (or the App Clip's handover) that arrives while someone is already signed in.
 * Taking it makes the two of you follow each other and may start a tag, so it is asked about
 * first, in the sign-up card's words: Accept claims it (the usual note follows), Not now lets it
 * go and nothing is made. A used invite, or one whose sender couldn't be found, is let go with a
 * note instead. The sign-up card is its own yes, so a brand-new account never sees this.
 */
export default function InviteConfirmSheet({ userId }: { userId: string }): React.JSX.Element {
  const { colors } = useAppTheme();
  const ready = useUserStore((s) => s.profile?.id === userId);
  const pendingToken = useInviteStore((s) => s.pendingToken);
  const confirmedToken = useInviteStore((s) => s.confirmedToken);
  const previewChecked = useInviteStore((s) => s.previewChecked);
  const preview = useInviteStore((s) => s.preview);
  const isClaiming = useInviteStore((s) => s.isClaiming);
  const ask = inviteAsk({
    ready,
    pendingToken,
    confirmedToken,
    previewChecked,
    preview,
    isClaiming,
  });
  // No one-time tip while this sheet is up.
  useCoachBlock(ask === 'ask');

  useEffect(() => {
    if (ask !== 'used' && ask !== 'unreadable') return;
    void useInviteStore.getState().setPending(null);
    useToastStore
      .getState()
      .show(ask === 'used' ? claimFailText('been used', null) : 'Couldn’t open that invite.');
  }, [ask]);

  const accept = () => void useInviteStore.getState().accept();
  const notNow = () => useInviteStore.getState().decline();
  const inviter = preview?.username ?? '';

  return (
    <Modal
      visible={ask === 'ask'}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={notNow}
    >
      <View style={styles.flex}>
        <Pressable
          style={styles.scrim}
          onPress={notNow}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        />
        <View style={[styles.panel, { backgroundColor: colors.bg }]}>
          <View style={[styles.handle, { backgroundColor: withAlpha(colors.text, ALPHA.a25) }]} />
          <Text style={[styles.headline, { color: colors.text }]} accessibilityRole="header">
            @{inviter} invited you
          </Text>
          <Text style={[styles.sub, { color: colors.muted }]}>
            {inviteAcceptLine({
              tag: preview?.tag,
              inviter: preview?.username,
              inviterPrivate: preview?.is_private,
            })}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Accept @${inviter}’s invite`}
            onPress={accept}
            style={({ pressed }) => [styles.main, pressed && styles.pressed]}
          >
            <Text style={styles.mainText}>Accept</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Not now, @${inviter}’s invite`}
            onPress={notNow}
            style={({ pressed }) => [
              styles.later,
              { borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.laterText, { color: colors.text }]}>Not now</Text>
          </Pressable>
          <KeyboardInset />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: withAlpha(COLORS.black, ALPHA.a55),
  },
  panel: {
    borderTopLeftRadius: RADIUS.r24,
    borderTopRightRadius: RADIUS.r24,
    paddingHorizontal: SPACE.s20,
    paddingTop: SPACE.s12,
    paddingBottom: SPACE.s32,
    gap: SPACE.s12,
  },
  handle: {
    width: SIZE.z40,
    height: SIZE.z4,
    borderRadius: RADIUS.r2,
    alignSelf: 'center',
    marginBottom: SPACE.s4,
  },
  headline: {
    fontSize: FONT_SIZE.f22,
    lineHeight: LINE_HEIGHT.l28,
    fontFamily: FONTS.bold,
  },
  sub: {
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l22,
    fontFamily: FONTS.regular,
  },
  main: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s16,
    alignItems: 'center',
    marginTop: SPACE.s4,
  },
  mainText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
  },
  later: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s16,
    alignItems: 'center',
  },
  laterText: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
  },
  pressed: {
    opacity: ALPHA.a80,
  },
});
