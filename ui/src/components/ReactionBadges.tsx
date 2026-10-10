import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { themeColors } from '@/hooks/useAppTheme';
import { myReaction, type ReactionSummary } from '@/lib/messageReactions';
import { GLYPH, TYPOGRAPHY } from '@/constants/typography';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  OFFSET,
  RADIUS,
  SCALE,
  SPACE,
  SPRING,
  withAlpha,
} from '@/constants/tokens';

/**
 * The reactions under a message: small pills, emoji and (past one) a count; yours in the accent.
 * A tap on a pill toggles that reaction for you. Your own emoji pops when it lands — only when it
 * appears or changes while this bubble is on screen, never for a reaction already there, and not
 * when the list reuses this row for another message.
 */
export default function ReactionBadges({
  messageId,
  reactions,
  own,
  dark,
  onToggle,
}: {
  messageId: string;
  reactions: ReactionSummary[];
  /** Under my own bubble (pills sit to the right). */
  own: boolean;
  dark: boolean;
  onToggle: (emoji: string) => void;
}): React.JSX.Element | null {
  const { border, muted, accentText } = themeColors(dark);
  const mine = myReaction(reactions);
  const [pop] = useState(() => new Animated.Value(1));
  const last = useRef({ messageId, mine });
  useEffect(() => {
    const before = last.current;
    last.current = { messageId, mine };
    if (before.messageId !== messageId || !mine || before.mine === mine) return;
    pop.setValue(SCALE.s0_68);
    Animated.spring(pop, { toValue: 1, ...SPRING.medal, useNativeDriver: true }).start();
  }, [messageId, mine, pop]);

  if (reactions.length === 0) return null;
  return (
    <View style={[styles.row, own ? styles.rowOwn : styles.rowOther]}>
      {reactions.map((r) => (
        <Animated.View key={r.emoji} style={r.mine ? { transform: [{ scale: pop }] } : undefined}>
          <Pressable
            onPress={() => onToggle(r.emoji)}
            accessibilityRole="button"
            accessibilityLabel={`${r.emoji} ${r.count}${r.mine ? ', yours' : ''}`}
            accessibilityHint={r.mine ? 'Takes your reaction off' : 'Reacts with this too'}
            accessibilityState={{ selected: r.mine }}
            hitSlop={{ top: OFFSET.o4, bottom: OFFSET.o4, left: OFFSET.o4, right: OFFSET.o4 }}
            style={({ pressed }) => [
              styles.pill,
              r.mine
                ? {
                    borderColor: COLORS.accent,
                    backgroundColor: withAlpha(COLORS.accent, ALPHA.a15),
                  }
                : { borderColor: border },
              pressed && styles.pressed,
            ]}
          >
            {/* Inter Tight carries no emoji glyphs: the phone's own emoji font draws these. */}
            <Text style={styles.emoji}>{r.emoji}</Text>
            {r.count > 1 ? (
              <Text style={[styles.count, { color: r.mine ? accentText : muted }]}>{r.count}</Text>
            ) : null}
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.s4,
    marginTop: -SPACE.s2,
    paddingHorizontal: SPACE.s4,
  },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s3,
    paddingHorizontal: SPACE.s8,
    paddingVertical: SPACE.s3,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER_WIDTH.w1,
  },
  emoji: { ...GLYPH.icon },
  count: { ...TYPOGRAPHY.captionStrong },
  pressed: { opacity: ALPHA.a70 },
});
