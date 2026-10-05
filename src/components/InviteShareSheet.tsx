import React from 'react';
import { View, Text, Pressable, Modal, Alert, StyleSheet } from 'react-native';
import KeyboardInset from '@/components/KeyboardInset';
import { inviteListSummary, inviteRow, type InviteItem } from '@/lib/inviteShare';
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
 * After posting (flag `tags-invite-step`): the post's invite links, one row each, showing which
 * are sent. Each "Send" opens one share sheet for one link; a sent one can be sent again.
 * Closing with links unsent asks first, since the app can't get them back later.
 * The camera is always dark, so this sheet is too.
 */
export default function InviteShareSheet({
  invites,
  onSend,
  onClose,
}: {
  /** Empty = hidden. */
  invites: InviteItem[];
  onSend: (token: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const summary = inviteListSummary(invites);
  const nextIndex = invites.findIndex((i) => i.status === 'not-sent');

  const close = () => {
    if (summary.allSent) {
      onClose();
      return;
    }
    const n = summary.unsent;
    Alert.alert(
      `Close without sending ${n === 1 ? '1 invite' : `${n} invites`}?`,
      "You won't be able to get these links back later.",
      [
        { text: 'Keep sending', style: 'cancel' },
        { text: 'Close', style: 'destructive', onPress: onClose },
      ]
    );
  };

  return (
    <Modal
      visible={invites.length > 0}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.flex}>
        <Pressable
          style={styles.scrim}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.panel}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.headline} accessibilityRole="header">
              {summary.headline}
            </Text>
            <Text style={styles.count} accessibilityLiveRegion="polite">
              {summary.count}
            </Text>
          </View>
          <Text style={styles.sub}>Each link is for one person. Send them one at a time.</Text>

          {invites.map((item, index) => {
            const row = inviteRow(item, index);
            const sent = item.status === 'sent';
            return (
              <View key={item.token} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={[styles.rowStatus, sent && styles.rowStatusSent]}>
                    {sent ? `✓ ${row.status}` : row.status}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={row.a11y}
                  onPress={() => onSend(item.token)}
                  style={({ pressed }) => [
                    styles.rowButton,
                    !sent && styles.rowButtonPrimary,
                    pressed && { opacity: ALPHA.a80 },
                  ]}
                >
                  <Text style={styles.rowButtonText}>{row.button}</Text>
                </Pressable>
              </View>
            );
          })}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nextIndex >= 0 ? `Send invite ${nextIndex + 1}` : 'Done'}
            onPress={() => (nextIndex >= 0 ? onSend(invites[nextIndex].token) : onClose())}
            style={({ pressed }) => [styles.main, pressed && { opacity: ALPHA.a85 }]}
          >
            <Text style={styles.mainText}>
              {nextIndex >= 0 ? `Send invite ${nextIndex + 1}` : 'Done'}
            </Text>
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
    backgroundColor: COLORS.bgDark,
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
    backgroundColor: withAlpha(COLORS.white, ALPHA.a25),
    alignSelf: 'center',
    marginBottom: SPACE.s4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACE.s12,
  },
  headline: {
    flex: 1,
    color: COLORS.white,
    fontSize: FONT_SIZE.f22,
    lineHeight: LINE_HEIGHT.l28,
    fontFamily: FONTS.bold,
  },
  count: {
    color: withAlpha(COLORS.offWhite, ALPHA.a60),
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
  },
  sub: {
    color: withAlpha(COLORS.offWhite, ALPHA.a75),
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l22,
    fontFamily: FONTS.regular,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
    paddingVertical: SPACE.s10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(COLORS.offWhite, ALPHA.a12),
  },
  rowText: {
    flex: 1,
    gap: SPACE.s2,
  },
  rowTitle: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.semiBold,
  },
  rowStatus: {
    color: withAlpha(COLORS.offWhite, ALPHA.a60),
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
  },
  rowStatusSent: {
    color: COLORS.accent,
  },
  rowButton: {
    minHeight: SIZE.z36,
    paddingHorizontal: SPACE.s16,
    borderRadius: RADIUS.r50,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: withAlpha(COLORS.offWhite, ALPHA.a40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowButtonPrimary: {
    borderColor: COLORS.accent,
  },
  rowButtonText: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
  },
  main: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s16,
    alignItems: 'center',
    marginTop: SPACE.s4,
  },
  mainText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
  },
});
