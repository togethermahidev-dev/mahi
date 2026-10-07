import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { inviteStepCopy, slotCount } from '@/lib/inviteStep';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  FONT_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/lib/themeColors';

/**
 * The tag sheet's lead when friends can't fill the post's slots:
 * why, a big button to invite, and how many slots are filled. The tag sheet is always dark.
 */
export default function InviteStep({
  maxTags,
  availableFriends,
  friends,
  invites,
  onAdd,
  onRemove,
}: {
  maxTags: number;
  availableFriends: number;
  friends: number;
  invites: number;
  onAdd: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const copy = inviteStepCopy({ maxTags, availableFriends, friends, invites });
  const { filled } = slotCount({ maxTags, friends, invites });

  return (
    <View style={styles.card}>
      <Text style={styles.headline} accessibilityRole="header">
        {copy.headline}
      </Text>
      <Text style={styles.why}>{copy.why}</Text>

      <View
        style={styles.countRow}
        accessible
        accessibilityLabel={copy.count}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.dots}>
          {Array.from({ length: maxTags }, (_, i) => (
            <View key={i} style={[styles.dot, i < filled && styles.dotFilled]} />
          ))}
        </View>
        <Text style={styles.count}>{copy.count}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.button}
        accessibilityHint={copy.canAdd ? "You'll get a link to send after posting" : undefined}
        accessibilityState={{ disabled: !copy.canAdd }}
        disabled={!copy.canAdd}
        onPress={onAdd}
        style={({ pressed }) => [
          styles.button,
          !copy.canAdd && styles.buttonDone,
          pressed && { opacity: ALPHA.a85 },
        ]}
      >
        <Text style={[styles.buttonText, !copy.canAdd && styles.buttonDoneText]}>
          {copy.button}
        </Text>
      </Pressable>

      {invites > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove a link"
          hitSlop={SPACE.s8}
          onPress={onRemove}
          style={({ pressed }) => [styles.remove, pressed && { opacity: ALPHA.a70 }]}
        >
          <Text style={styles.removeText}>Remove a link</Text>
        </Pressable>
      ) : null}

      <Text style={styles.after}>You'll send each link after you post.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: SPACE.s12,
    paddingBottom: SPACE.s4,
  },
  headline: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f22,
    lineHeight: LINE_HEIGHT.l28,
    fontFamily: FONTS.bold,
  },
  why: {
    color: withAlpha(COLORS.offWhite, ALPHA.a75),
    fontSize: FONT_SIZE.f15,
    lineHeight: LINE_HEIGHT.l22,
    fontFamily: FONTS.regular,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s10,
  },
  dots: {
    flexDirection: 'row',
    gap: SPACE.s6,
  },
  dot: {
    width: SIZE.z10,
    height: SIZE.z10,
    borderRadius: RADIUS.pill,
    backgroundColor: withAlpha(COLORS.offWhite, ALPHA.a20),
  },
  dotFilled: {
    backgroundColor: COLORS.accent,
  },
  count: {
    color: COLORS.offWhite,
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.r50,
    paddingVertical: SPACE.s18,
    alignItems: 'center',
  },
  buttonDone: {
    backgroundColor: withAlpha(COLORS.accent, ALPHA.a35),
  },
  buttonText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f17,
    fontFamily: FONTS.semiBold,
  },
  /** Done: the faint button sits on the dark sheet, so its words stay light. */
  buttonDoneText: {
    color: COLORS.white,
  },
  remove: {
    alignSelf: 'center',
    paddingVertical: SPACE.s4,
  },
  removeText: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
  after: {
    color: themeColors(true).muted,
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
});
