import React from 'react';
import { View, Text, StyleSheet, Pressable, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import type { TaggedUser } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BLUR_INTENSITY,
  FONT_SIZE,
  LAYOUT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

interface Props {
  users: TaggedUser[];
  onPressUser?: (user: TaggedUser) => void;
  /** Override the default absolute `left OFFSET.o16, bottom OFFSET.o16` positioning. */
  style?: StyleProp<ViewStyle>;
}

export default function TaggedBubbleStack({ users, onPressUser, style }: Props) {
  if (users.length === 0) return null;
  const visible = users.slice(0, LAYOUT.taggedBubbles);
  const overflow = users.length - LAYOUT.taggedBubbles;

  return (
    <View style={[styles.stack, style]} pointerEvents="box-none">
      {visible.map((u) => (
        <Pressable
          style={({ pressed }) => pressed && { opacity: ALPHA.a85 }}
          key={u.user_id}
          disabled={!onPressUser}
          onPress={() => onPressUser?.(u)}
          accessibilityRole="link"
          accessibilityLabel={`@${u.username}`}
        >
          <BlurView intensity={BLUR_INTENSITY.i40} tint="dark" style={styles.bubble}>
            <Text style={styles.bubbleText} numberOfLines={1} ellipsizeMode="tail">
              @{u.username}
            </Text>
          </BlurView>
        </Pressable>
      ))}
      {overflow > 0 ? (
        <BlurView intensity={BLUR_INTENSITY.i40} tint="dark" style={styles.bubble}>
          <Text style={styles.bubbleText}>+{overflow} more</Text>
        </BlurView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: OFFSET.o16,
    bottom: OFFSET.o16,
    gap: SPACE.s6,
    alignItems: 'flex-start',
  },
  bubble: {
    height: SIZE.z32,
    borderRadius: RADIUS.r16,
    paddingHorizontal: SPACE.s14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(COLORS.white, ALPHA.a18),
    backgroundColor: withAlpha(COLORS.black, ALPHA.a45),
    maxWidth: SIZE.z180,
  },
  bubbleText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
  },
});
