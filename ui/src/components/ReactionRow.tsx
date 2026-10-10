import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { themeColors } from '@/hooks/useAppTheme';
import { QUICK_EMOJI } from '@/lib/messageReactions';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  FONT_SIZE,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/**
 * The quick row a held message offers where Apple's menu isn't available (build 10, Android):
 * six emoji and a "+" for any other. One row that never scrolls, so the "+" is always on screen.
 * On builds with @expo/ui the same row is Apple's own (a ControlGroup in the context menu).
 */
export default function ReactionRow({
  mine,
  dark,
  onPick,
  onMore,
}: {
  /** The emoji I already reacted with, if any (shown picked). */
  mine: string | null;
  dark: boolean;
  onPick: (emoji: string) => void;
  onMore: () => void;
}): React.JSX.Element {
  const { text, border } = themeColors(dark);
  return (
    <View style={styles.row}>
      {QUICK_EMOJI.map((emoji) => {
        const picked = mine === emoji;
        return (
          <Pressable
            key={emoji}
            onPress={() => onPick(emoji)}
            accessibilityRole="button"
            accessibilityLabel={`React with ${emoji}`}
            accessibilityState={{ selected: picked }}
            style={({ pressed }) => [
              styles.button,
              picked && {
                borderColor: COLORS.accent,
                backgroundColor: withAlpha(COLORS.accent, ALPHA.a15),
              },
              pressed && styles.pressed,
            ]}
          >
            {/* Inter Tight carries no emoji glyphs: the phone's own emoji font draws these. */}
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel="Any other emoji"
        style={({ pressed }) => [styles.button, { borderColor: border }, pressed && styles.pressed]}
      >
        <Text style={[styles.plus, { color: text }]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.s4,
  },
  button: {
    flex: 1,
    maxWidth: SIZE.z44,
    aspectRatio: 1,
    borderRadius: RADIUS.pill,
    borderWidth: BORDER_WIDTH.w1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.f24 },
  plus: { fontFamily: FONTS.regular, fontSize: FONT_SIZE.f24 },
  pressed: { opacity: ALPHA.a70 },
});
